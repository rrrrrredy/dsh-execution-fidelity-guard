# v0.1.0-alpha.2

Security and evidence-integrity patch for the unofficial DeepSeek Harness adapter.

This release closes wrapper and global-option install-command bypasses, restricts `evidence:release` to direct successful `gh release create` or `gh release view` commands, rejects evidence kinds with no producer, and disables workspace-path disk receipts. It also documents the non-exhaustive semantics of `authorization.allowed`.

The adapter remains pinned to DeepSeek Harness `v0.1.2-alpha.2`. Windows, Ubuntu, and macOS CI run the core suite, real ToolRuntime and AgentLoop integration tests, release validation, and packed execution on Node 22.19 and Node 24.

The release does not establish real-world efficacy, false-positive rate, installed-client UX, or the outstanding 100-task shadow and 800-task controlled targets.
