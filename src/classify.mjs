// SPDX-License-Identifier: Apache-2.0

const READ_COMMANDS = new Set([
  "cat", "dir", "find", "get-childitem", "get-content", "get-filehash",
  "get-item", "head", "ls", "pwd", "resolve-path", "rg", "sed",
  "select-string", "tail", "test-path", "where", "where.exe",
]);

function executableName(token) {
  return String(token ?? "").replace(/\\/g, "/").split("/").pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/i, "");
}

function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      current += char;
      if (char === quote && command[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "\n" || char === ";" || char === "|" || char === "&") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      if ((char === "|" || char === "&") && command[index + 1] === char) index += 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (quote) {
      if (char === quote && segment[index - 1] !== "\\") quote = null;
      else current += char;
    } else if (char === "'" || char === '"') quote = char;
    else if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
    } else current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function unwrap(tokens, depth = 0) {
  if (depth > 2 || !tokens.length) return tokens;
  let view = [...tokens];
  let exe = executableName(view[0]);
  if (exe === "sudo") {
    view.shift();
    while (view[0]?.startsWith("-")) {
      const option = view.shift();
      if (["-u", "--user", "-g", "--group", "-h", "--host"].includes(option) && view[0]) view.shift();
    }
    return unwrap(view, depth + 1);
  }
  if (exe === "env") {
    view.shift();
    while (view[0] && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(view[0]) || view[0].startsWith("-"))) view.shift();
    return unwrap(view, depth + 1);
  }
  if (["bash", "sh", "zsh", "pwsh", "powershell", "cmd"].includes(exe)) {
    const flagIndex = view.findIndex((item) => ["-c", "--command", "/c"].includes(item.toLowerCase()));
    if (flagIndex >= 0 && view[flagIndex + 1]) return unwrap(tokenize(view.slice(flagIndex + 1).join(" ")), depth + 1);
  }
  return view;
}

function hasRedirect(segment) {
  let quote = null;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (quote) {
      if (char === quote && segment[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === ">") return true;
  }
  return false;
}

function classifySegment(segment) {
  const tokens = unwrap(tokenize(segment));
  const exe = executableName(tokens[0]);
  const args = tokens.slice(1).map((item) => item.toLowerCase());
  const joined = [exe, ...args].join(" ");
  const tags = new Set();
  if (!exe) return tags;
  if (
    /^(?:npm|pnpm|yarn)\s+(?:i|install|add)(?:\s|$)/.test(joined) ||
    /^(?:pip|pip3)\s+install(?:\s|$)/.test(joined) ||
    /^python(?:3)?\s+-m\s+pip\s+install(?:\s|$)/.test(joined) ||
    /^uv\s+(?:pip\s+)?install(?:\s|$)/.test(joined) ||
    /^(?:cargo|go)\s+install(?:\s|$)/.test(joined) ||
    /^(?:brew|apt|apt-get|dnf|yum|pacman|winget|choco|scoop)\s+(?:install|add)(?:\s|$)/.test(joined)
  ) {
    return new Set(["install_local", "write_workspace", "network"]);
  }
  if (
    /^git\s+push(?:\s|$)/.test(joined) ||
    /^npm\s+(?:publish|unpublish|deprecate)(?:\s|$)/.test(joined) ||
    /^gh\s+(?:repo|release|pr|issue|gist)\s+(?:create|edit|delete|merge|close|comment)(?:\s|$)/.test(joined)
  ) return new Set(["publish", "external_side_effect", "network"]);
  if (
    ["rm", "rmdir", "del", "erase", "remove-item"].includes(exe) ||
    /^git\s+(?:clean|rm)(?:\s|$)/.test(joined) ||
    /^git\s+reset\s+--hard(?:\s|$)/.test(joined)
  ) return new Set(["delete", "destructive"]);
  if (
    ["add-content", "copy-item", "cp", "mkdir", "move-item", "mv", "new-item", "set-content", "tee", "touch"].includes(exe) ||
    hasRedirect(segment)
  ) return new Set(["write_workspace"]);
  if (READ_COMMANDS.has(exe)) return new Set(["read"]);
  if (exe === "git" && ["status", "diff", "log", "show", "rev-parse", "ls-files", "branch"].includes(args[0])) return new Set(["read"]);
  if (["curl", "wget", "invoke-webrequest", "irm", "iwr"].includes(exe)) return new Set(["network"]);
  tags.add("unknown");
  return tags;
}

function classifyNamedTool(name) {
  const lower = name.toLowerCase().split("__").filter(Boolean).at(-1) || "unknown";
  if (/^(?:read|get|list|view|search|find|open|status|capture)(?:_|$)/.test(lower)) return new Set(["read"]);
  if (["apply_patch", "edit", "write", "str_replace_editor"].includes(lower)) return new Set(["write_workspace"]);
  if (/^(?:delete|remove|archive|uninstall)(?:_|$)/.test(lower)) return new Set(["delete", "external_side_effect"]);
  if (/^(?:create|update|send|publish|push|handoff|share|install|set|post|reply|merge|move|rename|fork|cancel|close|approve)(?:_|$)/.test(lower)) {
    return new Set(["external_side_effect"]);
  }
  return new Set(["unknown"]);
}

function commandFromArguments(argumentsValue) {
  if (!argumentsValue || typeof argumentsValue !== "object") return "";
  for (const key of ["command", "script", "code"]) {
    if (typeof argumentsValue[key] === "string") return argumentsValue[key];
  }
  return "";
}

export function classifyToolAction(exec) {
  const toolName = String(exec?.name ?? "unknown");
  const command = commandFromArguments(exec?.arguments);
  const tags = new Set();
  if (command && ["bash", "sh", "zsh", "pwsh", "powershell", "shell", "exec_command"].includes(toolName.toLowerCase())) {
    for (const segment of splitSegments(command)) {
      for (const tag of classifySegment(segment)) tags.add(tag);
    }
  } else {
    for (const tag of classifyNamedTool(toolName)) tags.add(tag);
  }
  if (!tags.size) tags.add("unknown");
  const highRiskTags = new Set(["delete", "destructive", "install_local", "publish", "external_side_effect"]);
  return {
    toolName,
    command,
    tags: [...tags].sort(),
    highRisk: [...tags].some((tag) => highRiskTags.has(tag)),
    reversible: ![...tags].some((tag) => highRiskTags.has(tag) || tag === "write_workspace"),
  };
}
