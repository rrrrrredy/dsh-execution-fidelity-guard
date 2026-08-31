// SPDX-License-Identifier: Apache-2.0

const READ_COMMANDS = new Set([
  "cat", "dir", "find", "get-childitem", "get-content", "get-filehash",
  "get-item", "head", "ls", "pwd", "resolve-path", "rg", "sed",
  "select-string", "tail", "test-path", "where", "where.exe",
]);

const GIT_VALUE_OPTIONS = new Set([
  "-c", "--config-env", "--exec-path", "--git-dir", "--namespace",
  "--super-prefix", "--work-tree",
]);
const GH_VALUE_OPTIONS = new Set(["-r", "--hostname", "--repo"]);
const NPM_VALUE_OPTIONS = new Set([
  "-w", "--cache", "--config", "--prefix", "--registry", "--scope",
  "--userconfig", "--workspace",
]);
const PNPM_VALUE_OPTIONS = new Set([...NPM_VALUE_OPTIONS, "-c", "--dir"]);
const YARN_VALUE_OPTIONS = new Set([...NPM_VALUE_OPTIONS, "--cwd"]);
const UV_VALUE_OPTIONS = new Set([
  "--cache-dir", "--config-file", "--directory", "--project", "--python",
]);
const POETRY_VALUE_OPTIONS = new Set([
  "-c", "-p", "--directory", "--project",
]);
const SUDO_VALUE_OPTIONS = new Set([
  "-c", "-g", "-h", "-p", "-r", "-t", "-u",
  "--chdir", "--command-timeout", "--group", "--host", "--prompt", "--role",
  "--type", "--user",
]);
const ENV_VALUE_OPTIONS = new Set([
  "-c", "-s", "-u", "--argv0", "--chdir", "--split-string", "--unset",
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

function discardWrapperOptions(tokens, optionsWithValues, allowAssignments = false) {
  while (tokens[0]) {
    const token = String(tokens[0]);
    if (allowAssignments && /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      tokens.shift();
      continue;
    }
    if (token === "--") {
      tokens.shift();
      break;
    }
    if (!token.startsWith("-") || token === "-") break;
    const lower = token.toLowerCase();
    const option = lower.split("=", 1)[0];
    tokens.shift();
    const joinedShortValue =
      option.length === 2 && lower.length > 2 && !lower.includes("=");
    if (
      !lower.includes("=") &&
      !joinedShortValue &&
      optionsWithValues.has(option) &&
      tokens[0]
    ) {
      tokens.shift();
    }
  }
}

function commandTokens(segment) {
  const tokens = tokenize(segment);
  while (tokens.length) {
    const exe = executableName(tokens[0]);
    if (tokens[0] === "&" || exe === "command" || exe === "nohup") {
      tokens.shift();
      continue;
    }
    if (exe === "sudo") {
      tokens.shift();
      discardWrapperOptions(tokens, SUDO_VALUE_OPTIONS);
      continue;
    }
    if (exe === "env") {
      tokens.shift();
      discardWrapperOptions(tokens, ENV_VALUE_OPTIONS, true);
      continue;
    }
    break;
  }
  while (tokens[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens.shift();
  return tokens;
}

function wrappedShellCommand(tokens) {
  const exe = executableName(tokens[0]);
  const args = tokens.slice(1);
  const lower = args.map((item) => item.toLowerCase());
  let marker = -1;
  if (["bash", "sh", "zsh"].includes(exe)) {
    marker = lower.findIndex((item) => ["-c", "-lc"].includes(item));
  } else if (["pwsh", "powershell"].includes(exe)) {
    marker = lower.findIndex((item) => ["-c", "-command"].includes(item));
  } else if (exe === "cmd") {
    marker = lower.findIndex((item) => ["/c", "/k"].includes(item));
  }
  return marker >= 0 && args[marker + 1]
    ? args.slice(marker + 1).join(" ")
    : null;
}

function firstNonOption(args, optionsWithValues = new Set()) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index].toLowerCase();
    if (value === "--") {
      return args[index + 1]
        ? { value: args[index + 1].toLowerCase(), index: index + 1 }
        : null;
    }
    if (!value.startsWith("-") || value === "-") {
      return { value, index };
    }
    const option = value.split("=", 1)[0];
    if (!value.includes("=") && optionsWithValues.has(option)) index += 1;
  }
  return null;
}

function commandView(args, optionsWithValues = new Set()) {
  const entry = firstNonOption(args, optionsWithValues);
  return entry
    ? { name: entry.value, args: args.slice(entry.index + 1) }
    : { name: null, args: [] };
}

function isInstall(tokens) {
  const exe = executableName(tokens[0]);
  const args = tokens.slice(1).map((item) => item.toLowerCase());
  const pipValueOptions = new Set([
    "--cache-dir", "--cert", "--client-cert", "--exists-action", "--log",
    "--proxy", "--python", "--retries", "--timeout", "--trusted-host",
  ]);
  const systemValueOptions = new Set([
    "--config-file", "--option", "--target-release", "-c", "-o", "-t",
  ]);
  const pipCommand = firstNonOption(args, pipValueOptions)?.value;
  if (/^pip(?:3(?:\.\d+)?)?$/.test(exe) && pipCommand === "install") return true;
  const moduleIndex = args.indexOf("-m");
  if (
    (exe === "py" || /^python(?:3(?:\.\d+)?)?$/.test(exe)) &&
    moduleIndex >= 0 &&
    args[moduleIndex + 1] === "pip" &&
    firstNonOption(args.slice(moduleIndex + 2), pipValueOptions)?.value === "install"
  ) return true;
  if (
    String(tokens[0] ?? "").startsWith("$") &&
    moduleIndex >= 0 &&
    args[moduleIndex + 1] === "pip" &&
    firstNonOption(args.slice(moduleIndex + 2), pipValueOptions)?.value === "install"
  ) return true;
  const uvCommand = firstNonOption(args, UV_VALUE_OPTIONS);
  if (
    exe === "uv" &&
    ((uvCommand?.value === "pip" &&
      firstNonOption(args.slice(uvCommand.index + 1), pipValueOptions)?.value ===
        "install") ||
      uvCommand?.value === "sync" ||
      uvCommand?.value === "run")
  ) return true;
  const npmCommand = firstNonOption(args, NPM_VALUE_OPTIONS)?.value;
  if (
    exe === "npm" &&
    ["install", "i", "ci", "link", "exec", "x", "create"].includes(npmCommand)
  ) return true;
  const packageManagerCommand =
    exe === "pnpm"
      ? firstNonOption(args, PNPM_VALUE_OPTIONS)?.value
      : exe === "yarn"
        ? firstNonOption(args, YARN_VALUE_OPTIONS)?.value
        : firstNonOption(args, NPM_VALUE_OPTIONS)?.value;
  if (
    ["pnpm", "yarn", "bun"].includes(exe) &&
    ["install", "add", "i", "create"].includes(packageManagerCommand)
  ) return true;
  const systemCommand = firstNonOption(args, systemValueOptions)?.value;
  if (
    ["cargo", "go", "gem", "conda", "mamba", "winget", "choco", "scoop",
      "brew", "apt", "apt-get", "dnf", "yum"].includes(exe) &&
    systemCommand === "install"
  ) return true;
  if (
    exe === "poetry" &&
    firstNonOption(args, POETRY_VALUE_OPTIONS)?.value === "install"
  ) return true;
  if (exe === "pipenv" && (!args[0] || args[0] === "install" || args[0] === "sync")) return true;
  if (exe === "bundle" && args[0] === "install") return true;
  if (exe === "dotnet" && args[0] === "tool" && args[1] === "install") return true;
  if (exe === "npx" || exe === "uvx" || exe === "bunx") return true;
  if (["pnpm", "yarn"].includes(exe) && args[0] === "dlx") return true;
  if (exe === "pipx" && ["install", "run"].includes(args[0])) return true;
  if (exe === "corepack" && ["install", "prepare", "use"].includes(args[0])) return true;
  if (exe === "codex" && args[0] === "plugin" &&
      (args[1] === "add" || (args[1] === "marketplace" && args[2] === "add"))) return true;
  if (exe === "dsh" && args[0] === "plugin" && args[1] === "add") return true;
  return exe === "install-package" || exe === "install-module";
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

function classifySegment(segment, depth = 0) {
  const tokens = commandTokens(segment);
  const exe = executableName(tokens[0]);
  const args = tokens.slice(1).map((item) => item.toLowerCase());
  const tags = new Set();
  if (!exe) return tags;
  if (depth < 2) {
    const wrapped = wrappedShellCommand(tokens);
    if (wrapped) {
      for (const nested of splitSegments(wrapped)) {
        for (const tag of classifySegment(nested, depth + 1)) tags.add(tag);
      }
      if (tags.size) return tags;
    }
  }
  if (isInstall(tokens)) {
    return new Set(["install_local", "write_workspace", "network"]);
  }
  const git = exe === "git" ? commandView(args, GIT_VALUE_OPTIONS) : null;
  const npm = exe === "npm" ? commandView(args, NPM_VALUE_OPTIONS) : null;
  const gh = exe === "gh" ? commandView(args, GH_VALUE_OPTIONS) : null;
  const ghSubcommand =
    gh && ["gist", "issue", "pr", "release", "repo"].includes(gh.name)
      ? commandView(gh.args, GH_VALUE_OPTIONS)
      : null;
  if (
    git?.name === "push" ||
    (npm && ["publish", "unpublish", "deprecate"].includes(npm.name)) ||
    (ghSubcommand &&
      ["create", "edit", "delete", "merge", "close", "comment"].includes(ghSubcommand.name))
  ) return new Set(["publish", "external_side_effect", "network"]);
  if (
    ["rm", "rmdir", "del", "erase", "remove-item"].includes(exe) ||
    (exe === "find" && args.includes("-delete")) ||
    git?.name === "clean" ||
    git?.name === "rm" ||
    (git?.name === "reset" && git.args.includes("--hard")) ||
    (git?.name === "branch" && (git.args.includes("-d") || git.args.includes("--delete")))
  ) return new Set(["delete", "destructive"]);
  if (
    ["add-content", "copy-item", "cp", "mkdir", "move-item", "mv", "new-item", "set-content", "tee", "touch"].includes(exe) ||
    hasRedirect(segment)
  ) return new Set(["write_workspace"]);
  if (READ_COMMANDS.has(exe)) return new Set(["read"]);
  if (git && ["status", "diff", "log", "show", "rev-parse", "ls-files", "branch"].includes(git.name)) return new Set(["read"]);
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
