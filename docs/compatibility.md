# Compatibility

The initial compatibility target is DeepSeek Harness `v0.1.2-alpha.2` with Node `^22.19.0 || >=24.0.0`.

Runtime imports are limited to the public packages and extension points used by that release:

- `@deepseek-ai/dsh-tools` `tools/pre-execute`, `tools/result`, and `ctx.tools.guard()`
- `@deepseek-ai/dsh-agent` `agent/turn-stopping` and the live Agent interface
- `@deepseek-ai/dsh-llm` `createUserMessage`
- `@deepseek-ai/cordis` plugin lifecycle

The peer dependency on DSH packages is exact because the upstream project labels the release a developer preview. A new Harness alpha must pass the real ToolRuntime and AgentLoop integration suite before this package broadens its range.

Shell classification covers the platform split in the official base bundle: `bash` on Linux/macOS and `pwsh` on Windows. Common aliases such as `powershell`, `sh`, and `zsh` are also recognized for custom profiles.

