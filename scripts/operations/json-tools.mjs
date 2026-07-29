import { isDeepStrictEqual } from "node:util";
import { readFile, writeFile } from "node:fs/promises";

const MAX_JSON_BYTES = 128 * 1024 * 1024;

export function parseExactOptions(arguments_, names) {
  const result = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (
      typeof option !== "string" ||
      !option.startsWith("--") ||
      typeof value !== "string" ||
      value.startsWith("--")
    ) {
      throw new Error("ARGUMENTS_INVALID");
    }
    const name = option.slice(2);
    if (!names.includes(name) || result.has(name))
      throw new Error("ARGUMENTS_INVALID");
    result.set(name, value);
  }
  if (result.size !== names.length || names.some((name) => !result.has(name)))
    throw new Error("ARGUMENTS_INVALID");
  return Object.fromEntries(result);
}

export async function readJson(path) {
  const bytes = await readFile(path);
  if (bytes.byteLength > MAX_JSON_BYTES)
    throw new Error("JSON_INPUT_TOO_LARGE");
  return JSON.parse(bytes.toString("utf8"));
}

export async function writeNewJson(path, value) {
  await writeFile(path, `${JSON.stringify(sortObjectKeys(value), null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

export function deepEqual(left, right) {
  return isDeepStrictEqual(left, right);
}

export function differencePaths(left, right, path = "$", output = []) {
  if (isDeepStrictEqual(left, right)) return output;
  if (Array.isArray(left) && Array.isArray(right)) {
    const maximum = Math.max(left.length, right.length);
    for (let index = 0; index < maximum; index += 1)
      differencePaths(left[index], right[index], `${path}[${index}]`, output);
    return output;
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort();
    for (const key of keys)
      differencePaths(left[key], right[key], `${path}.${key}`, output);
    return output;
  }
  output.push(path);
  return output;
}

export function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObjectKeys(child)]),
  );
}
