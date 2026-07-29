const INIT_OPTIONS = new Set([
  "url",
  "code",
  "save-dir",
  "interval",
  "device-name",
]);
const INIT_FLAGS = new Set(["force"]);

const INSPECT_OPTIONS = new Set([
  "save-dir",
  "canonical-output",
  "payload-output",
]);

export interface InspectArguments {
  saveDirectory: string;
  canonicalOutput: string;
  payloadOutput: string;
}

export function parseArguments(arguments_: string[]): Map<string, string> {
  return parseOptions(arguments_, INIT_OPTIONS, INIT_FLAGS);
}

export function parseInspectArguments(arguments_: string[]): InspectArguments {
  const options = parseOptions(arguments_, INSPECT_OPTIONS);
  const saveDirectory = options.get("save-dir");
  const canonicalOutput = options.get("canonical-output");
  const payloadOutput = options.get("payload-output");
  if (
    options.size !== 3 ||
    saveDirectory === undefined ||
    canonicalOutput === undefined ||
    payloadOutput === undefined
  ) {
    throw new Error("ARGUMENTS_INVALID");
  }
  return { saveDirectory, canonicalOutput, payloadOutput };
}

function parseOptions(
  arguments_: string[],
  allowedOptions: ReadonlySet<string>,
  allowedFlags: ReadonlySet<string> = new Set(),
): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const option = arguments_[index];
    if (option === undefined || !option.startsWith("--"))
      throw new Error("ARGUMENTS_INVALID");
    const key = option.slice(2);
    if (result.has(key)) throw new Error("ARGUMENTS_INVALID");
    if (allowedFlags.has(key)) {
      result.set(key, "true");
      continue;
    }
    const value = arguments_[index + 1];
    if (
      !allowedOptions.has(key) ||
      value === undefined ||
      value.startsWith("--")
    )
      throw new Error("ARGUMENTS_INVALID");
    result.set(key, value);
    index += 1;
  }
  return result;
}

export function helpText(version: string, locale: CliLocale = "en"): string {
  const text = messages(locale);
  return `palbeacon ${version}

${text.description}

${text.commandsHeading}
  init      ${text.commands.init}
  run       ${text.commands.run}
  status    ${text.commands.status}
  logout    ${text.commands.logout}

${text.gettingStartedHeading}
  palbeacon init
  palbeacon run

${text.localeHint}`;
}
import { messages, type CliLocale } from "./locale.js";
