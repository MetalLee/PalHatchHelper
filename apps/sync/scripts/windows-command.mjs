import process from "node:process";

export function windowsCommandInvocation(
  executable,
  arguments__,
  commandInterpreter = process.env.ComSpec ?? "cmd.exe",
) {
  const command = [executable, ...arguments__]
    .map(quoteWindowsCommandArgument)
    .join(" ");
  return {
    executable: commandInterpreter,
    arguments: ["/d", "/s", "/c", `call ${command}`],
  };
}

function quoteWindowsCommandArgument(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
