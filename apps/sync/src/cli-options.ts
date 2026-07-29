const INIT_OPTIONS = new Set([
  "url",
  "code",
  "save-dir",
  "interval",
  "device-name",
  "sync-now",
]);

export function parseArguments(arguments_: string[]): Map<string, string> {
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
    if (!INIT_OPTIONS.has(key)) throw new Error("ARGUMENTS_INVALID");
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
  palbeacon-sync status
  palbeacon-sync logout

第一版仅支持 Linux x64。程序只读取并复制存档，不修改源文件。Parser 已随包提供，无需安装 Python 或额外解压组件。`;
}
