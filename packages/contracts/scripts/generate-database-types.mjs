import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required and must point to a local database",
  );
}

const parsedDatabaseUrl = new URL(databaseUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
if (!localHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error("Refusing to introspect a non-local database");
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 5,
  idle_timeout: 1,
});

const columns = await sql`
  select
    column_name,
    table_name,
    is_nullable,
    column_default,
    is_identity,
    is_generated,
    data_type,
    udt_name,
    ordinal_position
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
    )
  order by table_name, ordinal_position
`;

const enumRows = await sql`
  select type.typname as enum_name, enum.enumlabel as enum_value
  from pg_type as type
  join pg_namespace as namespace on namespace.oid = type.typnamespace
  join pg_enum as enum on enum.enumtypid = type.oid
  where namespace.nspname = 'public'
  order by type.typname, enum.enumsortorder
`;

const foreignKeys = await sql`
  select
    constraint_record.conname as constraint_name,
    source_table.relname as table_name,
    target_table.relname as referenced_table,
    array_agg(source_column.attname order by key_column.ordinality) as columns,
    array_agg(target_column.attname order by key_column.ordinality) as referenced_columns
  from pg_constraint as constraint_record
  join pg_class as source_table on source_table.oid = constraint_record.conrelid
  join pg_namespace as source_namespace on source_namespace.oid = source_table.relnamespace
  join pg_class as target_table on target_table.oid = constraint_record.confrelid
  join lateral unnest(constraint_record.conkey) with ordinality
    as key_column(attribute_number, ordinality) on true
  join lateral unnest(constraint_record.confkey) with ordinality
    as referenced_key(attribute_number, ordinality)
    on referenced_key.ordinality = key_column.ordinality
  join pg_attribute as source_column
    on source_column.attrelid = source_table.oid
   and source_column.attnum = key_column.attribute_number
  join pg_attribute as target_column
    on target_column.attrelid = target_table.oid
   and target_column.attnum = referenced_key.attribute_number
  where constraint_record.contype = 'f'
    and source_namespace.nspname = 'public'
  group by constraint_record.conname, source_table.relname, target_table.relname
  order by source_table.relname, constraint_record.conname
`;

const functions = await sql`
  select
    procedure.proname as function_name,
    pg_get_function_arguments(procedure.oid) as function_arguments,
    pg_get_function_result(procedure.oid) as result_type
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and procedure.proname in (
      'admin_bind_player',
      'admin_publish_breeding_version',
      'admin_unbind_player',
      'cancel_breeding_job',
      'claim_breeding_job',
      'complete_breeding_job',
      'configure_game_data_source',
      'confirm_step_offspring',
      'create_breeding_job',
      'current_guild_id',
      'current_player_id',
      'fail_breeding_job',
      'heartbeat_breeding_job',
      'get_breeding_data_diff',
      'get_active_scoring_profiles_for_agent',
      'get_breeding_inventory_for_agent',
      'get_game_data_source_for_agent',
      'get_inventory_catalog_ids_for_agent',
      'get_inventory_data_status',
      'get_latest_inventory_snapshot_for_agent',
      'is_admin',
      'list_available_pals',
      'list_available_pals_page',
      'release_breeding_job',
      'release_stale_breeding_jobs',
      'record_inventory_snapshot_failure',
      'set_pal_share_enabled',
      'set_pal_share_enabled_for_web',
      'publish_inventory_snapshot',
      'update_breeding_step_status'
    )
  order by procedure.proname, procedure.oid
`;

await sql.end();

const enumValues = new Map();
for (const row of enumRows) {
  const values = enumValues.get(row.enum_name) ?? [];
  values.push(row.enum_value);
  enumValues.set(row.enum_name, values);
}

function scalarType(typeName) {
  const normalized = typeName
    .replace(/^public\./, "")
    .replace(/^timestamp with time zone$/, "timestamptz")
    .trim();
  if (normalized.endsWith("[]")) {
    return `${scalarType(normalized.slice(0, -2))}[]`;
  }
  if (enumValues.has(normalized)) {
    return `Database["public"]["Enums"]["${normalized}"]`;
  }
  if (
    [
      "uuid",
      "text",
      "varchar",
      "bpchar",
      "timestamptz",
      "timestamp",
      "date",
    ].includes(normalized)
  ) {
    return "string";
  }
  if (
    [
      "int2",
      "int4",
      "int8",
      "integer",
      "bigint",
      "smallint",
      "numeric",
      "float4",
      "float8",
      "real",
      "double precision",
    ].includes(normalized)
  ) {
    return "number";
  }
  if (["bool", "boolean"].includes(normalized)) {
    return "boolean";
  }
  if (["json", "jsonb"].includes(normalized)) {
    return "Json";
  }
  if (normalized === "void") {
    return "undefined";
  }
  return "Json";
}

function columnType(column) {
  let result;
  if (column.data_type === "ARRAY") {
    result = `${scalarType(column.udt_name.replace(/^_/, ""))}[]`;
  } else if (column.data_type === "USER-DEFINED") {
    result = scalarType(column.udt_name);
  } else {
    result = scalarType(column.data_type);
  }
  return column.is_nullable === "YES" ? `${result} | null` : result;
}

function splitArguments(argumentsSource) {
  if (!argumentsSource.trim()) {
    return [];
  }
  return argumentsSource.split(", ").map((argument) => {
    const separator = argument.indexOf(" ");
    const typeAndDefault = argument.slice(separator + 1);
    const defaultSeparator = typeAndDefault.indexOf(" DEFAULT ");
    return {
      name: argument.slice(0, separator),
      type:
        defaultSeparator === -1
          ? typeAndDefault
          : typeAndDefault.slice(0, defaultSeparator),
      optional: defaultSeparator !== -1,
      nullable: typeAndDefault.includes(" DEFAULT NULL"),
    };
  });
}

function resultType(resultSource, tableNames) {
  const tableMatch = resultSource.match(/^SETOF ([a-z_][a-z0-9_]*)$/);
  if (tableMatch && tableNames.has(tableMatch[1])) {
    return `Database["public"]["Tables"]["${tableMatch[1]}"]["Row"][]`;
  }
  const tableFields = resultSource.match(/^TABLE\((.*)\)$/);
  if (tableFields) {
    const fields = splitArguments(tableFields[1]);
    return `{ ${fields.map((field) => `${field.name}: ${scalarType(field.type)}`).join("; ")} }[]`;
  }
  return scalarType(resultSource);
}

const tableColumns = new Map();
for (const column of columns) {
  const values = tableColumns.get(column.table_name) ?? [];
  values.push(column);
  tableColumns.set(column.table_name, values);
}
const tableNames = new Set(tableColumns.keys());
const relationshipsByTable = new Map();
for (const relationship of foreignKeys) {
  const values = relationshipsByTable.get(relationship.table_name) ?? [];
  values.push(relationship);
  relationshipsByTable.set(relationship.table_name, values);
}

const lines = [
  "// Generated from a local PostgreSQL catalog. Do not edit directly.",
  "export type Json =",
  "  | string",
  "  | number",
  "  | boolean",
  "  | null",
  "  | { [key: string]: Json | undefined }",
  "  | Json[];",
  "",
  "export type Database = {",
  "  public: {",
  "    Tables: {",
];

for (const [tableName, tableColumnValues] of tableColumns) {
  lines.push(`      ${tableName}: {`, "        Row: {");
  for (const column of tableColumnValues) {
    lines.push(`          ${column.column_name}: ${columnType(column)};`);
  }
  lines.push("        };", "        Insert: {");
  for (const column of tableColumnValues) {
    if (column.is_generated === "ALWAYS") {
      continue;
    }
    const optional =
      column.is_nullable === "YES" ||
      column.column_default !== null ||
      column.is_identity === "YES";
    lines.push(
      `          ${column.column_name}${optional ? "?" : ""}: ${columnType(column)};`,
    );
  }
  lines.push("        };", "        Update: {");
  for (const column of tableColumnValues) {
    if (column.is_generated !== "ALWAYS") {
      lines.push(`          ${column.column_name}?: ${columnType(column)};`);
    }
  }
  lines.push("        };", "        Relationships: [");
  for (const relationship of relationshipsByTable.get(tableName) ?? []) {
    lines.push(
      "          {",
      `            foreignKeyName: ${JSON.stringify(relationship.constraint_name)};`,
      `            columns: ${JSON.stringify(relationship.columns)};`,
      "            isOneToOne: false;",
      `            referencedRelation: ${JSON.stringify(relationship.referenced_table)};`,
      `            referencedColumns: ${JSON.stringify(relationship.referenced_columns)};`,
      "          },",
    );
  }
  lines.push("        ];", "      };");
}

lines.push("    };", "    Views: { [_ in never]: never };", "    Functions: {");
for (const functionRow of functions) {
  const functionArguments = splitArguments(functionRow.function_arguments);
  lines.push(`      ${functionRow.function_name}: {`);
  if (functionArguments.length === 0) {
    lines.push("        Args: Record<string, never>;");
  } else {
    lines.push("        Args: {");
    for (const argument of functionArguments) {
      lines.push(
        `          ${argument.name}${argument.optional ? "?" : ""}: ${scalarType(argument.type)}${argument.nullable ? " | null" : ""};`,
      );
    }
    lines.push("        };");
  }
  lines.push(
    `        Returns: ${resultType(functionRow.result_type, tableNames)};`,
    "      };",
  );
}
lines.push("    };", "    Enums: {");
for (const [enumName, values] of enumValues) {
  lines.push(
    `      ${enumName}: ${values.map((value) => JSON.stringify(value)).join(" | ")};`,
  );
}
lines.push(
  "    };",
  "    CompositeTypes: { [_ in never]: never };",
  "  };",
  "};",
  "",
);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(packageRoot, "src/database.types.ts");
await writeFile(outputPath, lines.join("\n"), "utf8");
console.log(`Generated ${outputPath}`);
