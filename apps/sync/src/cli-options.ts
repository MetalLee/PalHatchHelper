const INIT_OPTIONS = new Set([
  "url",
  "code",
  "save-dir",
  "interval",
  "device-name",
  "sync-now",
]);

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
  return parseOptions(arguments_, INIT_OPTIONS);
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
): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if (
      option === undefined ||
      !option.startsWith("--") ||
      value === undefined ||
      value.startsWith("--")
    ) {
      throw new Error("ARGUMENTS_INVALID");
    }
    const key = option.slice(2);
    if (!allowedOptions.has(key) || result.has(key))
      throw new Error("ARGUMENTS_INVALID");
    result.set(key, value);
  }
  return result;
}

export function helpText(version: string): string {
  return `palbeacon-sync ${version}

用法：
  palbeacon-sync init --url <地址> --code <配对码> --save-dir <目录> [--interval 300] [--device-name <名称>] [--sync-now yes|no]
  palbeacon-sync run
  palbeacon-sync sync --once
  palbeacon-sync inspect --save-dir <目录> --canonical-output <文件> --payload-output <文件>
  palbeacon-sync status
  palbeacon-sync logout

inspect 不登录、不读取设备凭据，也不上传数据。两个输出文件必须显式提供且不能已存在。
第一版仅支持 Linux x64。程序只读取并复制存档，不修改源文件。Parser 已随包提供，无需安装 Python 或额外解压组件。`;
}
