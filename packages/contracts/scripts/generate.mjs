import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { compileFromFile } from "json-schema-to-typescript";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(packageRoot, "src/generated");
const repositoryRoot = resolve(packageRoot, "../..");
const pythonOutputDirectory = resolve(
  repositoryRoot,
  "apps/agent/src/pal_hatch_helper/generated",
);
const contracts = [
  "system-status",
  "readiness-status",
  "breeding-job",
  "pal-list-item",
];
const pythonContracts = ["breeding-job", "pal-list-item"];

await mkdir(outputDirectory, { recursive: true });
for (const contract of contracts) {
  const schemaPath = resolve(packageRoot, `schema/${contract}.schema.json`);
  const outputPath = resolve(outputDirectory, `${contract}.ts`);
  const source = await compileFromFile(schemaPath, {
    bannerComment: `/* Generated from ${contract}.schema.json. Do not edit directly. */`,
    style: { singleQuote: false },
  });

  await writeFile(outputPath, source, "utf8");
  console.log(`Generated ${outputPath}`);
}

function enumMember(value) {
  const member = value.replaceAll(/[^A-Za-z0-9]+/g, "_").toUpperCase();
  return /^[0-9]/.test(member) ? `VALUE_${member}` : member;
}

function fieldArguments(schema, kind) {
  const argumentsList = [];
  if (kind === "string") {
    if (schema.minLength !== undefined) {
      argumentsList.push(`min_length=${schema.minLength}`);
    }
    if (schema.maxLength !== undefined) {
      argumentsList.push(`max_length=${schema.maxLength}`);
    }
    if (schema.pattern !== undefined) {
      argumentsList.push(`pattern=${JSON.stringify(schema.pattern)}`);
    }
  }
  if (kind === "array") {
    if (schema.minItems !== undefined) {
      argumentsList.push(`min_length=${schema.minItems}`);
    }
    if (schema.maxItems !== undefined) {
      argumentsList.push(`max_length=${schema.maxItems}`);
    }
  }
  if (kind === "integer" || kind === "number") {
    if (schema.minimum !== undefined) {
      argumentsList.push(`ge=${schema.minimum}`);
    }
    if (schema.maximum !== undefined) {
      argumentsList.push(`le=${schema.maximum}`);
    }
  }
  return argumentsList;
}

function pythonType(schema) {
  if (schema.$ref) {
    return schema.$ref.split("/").at(-1);
  }

  const declaredTypes = Array.isArray(schema.type)
    ? schema.type
    : [schema.type];
  const nullable = declaredTypes.includes("null");
  const kind = declaredTypes.find((value) => value !== "null");
  let result;

  if (schema.enum) {
    result = `Literal[${schema.enum.map((value) => JSON.stringify(value)).join(", ")}]`;
  } else if (kind === "string" && schema.format === "uuid") {
    result = "UUID";
  } else if (kind === "string" && schema.format === "date-time") {
    result = "AwareDatetime";
  } else if (kind === "string") {
    result = "str";
  } else if (kind === "integer") {
    result = "int";
  } else if (kind === "number") {
    result = "float";
  } else if (kind === "boolean") {
    result = "bool";
  } else if (kind === "array") {
    result = `list[${pythonType(schema.items)}]`;
  } else if (kind === "object") {
    result = "dict[str, object]";
  } else {
    throw new Error(`Unsupported JSON Schema type: ${JSON.stringify(schema)}`);
  }

  const annotations = fieldArguments(schema, kind).map(
    (argument) => `Field(${argument})`,
  );
  if (kind === "array" && schema.uniqueItems) {
    annotations.push("AfterValidator(_ensure_unique)");
  }
  if (annotations.length > 0) {
    result = `Annotated[${result}, ${annotations.join(", ")}]`;
  }
  return nullable ? `${result} | None` : result;
}

function splitTopLevel(source) {
  const values = [];
  let bracketDepth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if ("[({".includes(character)) {
      bracketDepth += 1;
    } else if ("])}".includes(character)) {
      bracketDepth -= 1;
    } else if (character === "," && bracketDepth === 0) {
      values.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(source.slice(start).trim());
  return values;
}

function pythonFieldLines(name, type, optionalDefault) {
  const field = `    ${name}: ${type}${optionalDefault}`;
  if (field.length <= 100) {
    return [field];
  }

  const nullableSuffix = " | None";
  const nullable = type.endsWith(nullableSuffix);
  const baseType = nullable ? type.slice(0, -nullableSuffix.length) : type;
  if (baseType.startsWith("Annotated[") && baseType.endsWith("]")) {
    const argumentsList = splitTopLevel(
      baseType.slice("Annotated[".length, -1),
    );
    if (nullable && baseType.length + 8 <= 96) {
      return [
        "    " + name + ": (",
        `        ${baseType} | None`,
        `    )${optionalDefault}`,
      ];
    }
    const lines = [`    ${name}: ${nullable ? "(" : ""}Annotated[`];
    for (const argument of argumentsList) {
      lines.push(`        ${argument},`);
    }
    lines.push(`    ]${nullable ? " | None" : ""}`);
    if (nullable) {
      lines.push(`    )${optionalDefault}`);
    }
    return lines;
  }
  return ["    " + name + ": (", `        ${type}`, `    )${optionalDefault}`];
}

async function generatePythonContracts() {
  const schemas = await Promise.all(
    pythonContracts.map(async (contract) => {
      const source = await readFile(
        resolve(packageRoot, `schema/${contract}.schema.json`),
        "utf8",
      );
      return JSON.parse(source);
    }),
  );
  const definitions = new Map();
  for (const schema of schemas) {
    for (const [name, definition] of Object.entries(schema.$defs ?? {})) {
      definitions.set(name, definition);
    }
  }
  const usesLiteral = schemas.some((schema) =>
    Object.values(schema.properties ?? {}).some((property) => property.enum),
  );

  const lines = [
    '"""Generated from packages/contracts/schema. Do not edit directly."""',
    "",
    "from enum import StrEnum",
    `from typing import Annotated${usesLiteral ? ", Literal" : ""}`,
    "from uuid import UUID",
    "",
    "from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field",
    "",
    "",
    "def _ensure_unique[T](values: list[T]) -> list[T]:",
    "    if len(values) != len({repr(value) for value in values}):",
    '        raise ValueError("items must be unique")',
    "    return values",
    "",
    "",
  ];

  for (const [name, definition] of definitions) {
    if (definition.type !== "string" || !definition.enum) {
      throw new Error(`Python enum ${name} must be a string enum`);
    }
    lines.push(`class ${name}(StrEnum):`);
    for (const value of definition.enum) {
      lines.push(`    ${enumMember(value)} = ${JSON.stringify(value)}`);
    }
    lines.push("", "");
  }

  for (const schema of schemas) {
    const required = new Set(schema.required ?? []);
    lines.push(`class ${schema.title}(BaseModel):`);
    lines.push('    model_config = ConfigDict(extra="forbid")', "");
    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      const optionalDefault = required.has(name) ? "" : " = None";
      lines.push(
        ...pythonFieldLines(name, pythonType(property), optionalDefault),
      );
    }
    lines.push("", "");
  }

  const exportedNames = [
    ...definitions.keys(),
    ...schemas.map((schema) => schema.title),
  ].sort();
  const initLines = [
    '"""Generated shared contract models."""',
    "",
    "from pal_hatch_helper.generated.contracts import (",
    ...exportedNames.map((name) => `    ${name},`),
    ")",
    "",
    "__all__ = [",
    ...exportedNames.map((name) => `    ${JSON.stringify(name)},`),
    "]",
    "",
  ];

  await mkdir(pythonOutputDirectory, { recursive: true });
  const contractsPath = resolve(pythonOutputDirectory, "contracts.py");
  const initPath = resolve(pythonOutputDirectory, "__init__.py");
  while (lines.at(-1) === "") {
    lines.pop();
  }
  await writeFile(contractsPath, `${lines.join("\n")}\n`, "utf8");
  await writeFile(initPath, initLines.join("\n"), "utf8");
  console.log(`Generated ${contractsPath}`);
  console.log(`Generated ${initPath}`);
}

await generatePythonContracts();
