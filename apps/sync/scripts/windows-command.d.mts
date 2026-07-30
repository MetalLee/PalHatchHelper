export interface WindowsCommandInvocation {
  executable: string;
  arguments: string[];
}

export function windowsCommandInvocation(
  executable: string,
  arguments__: string[],
  commandInterpreter?: string,
): WindowsCommandInvocation;
