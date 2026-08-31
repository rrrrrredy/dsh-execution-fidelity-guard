// SPDX-License-Identifier: Apache-2.0

const SHELL_TOOL_NAMES = new Set([
  "bash", "sh", "zsh", "pwsh", "powershell", "shell", "exec_command",
]);

export function inferToolOutcome(result, toolName, command = "") {
  if (result?.isError === true) {
    return { status: "fail", kind: "tool_error", exitCode: null };
  }
  if (command && SHELL_TOOL_NAMES.has(String(toolName ?? "").toLowerCase())) {
    const value = result?.value;
    if (value?.kind === "foreground" && Number.isInteger(value.exitCode)) {
      return {
        status: value.exitCode === 0 ? "pass" : "fail",
        kind: "foreground",
        exitCode: value.exitCode,
      };
    }
    if (value?.kind === "background") {
      return { status: "unknown", kind: "background", exitCode: null };
    }
    return { status: "unknown", kind: "shell_status_missing", exitCode: null };
  }
  return result?.isError === false
    ? { status: "pass", kind: "tool_success", exitCode: null }
    : { status: "unknown", kind: "tool_status_missing", exitCode: null };
}
