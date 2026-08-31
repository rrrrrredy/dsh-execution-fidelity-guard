# Changelog

## 0.1.0-alpha.2 - 2026-08-31

- Closed install-classification bypasses involving environment wrappers, global package-manager options, and versioned Python or pip executables.
- Narrowed release evidence so push, pull-request, and package-publication results cannot prove a GitHub Release.
- Rejected unsupported `database` and `user` evidence requirements instead of accepting contracts that could never complete.
- Disabled optional disk receipt persistence after adversarial review found a workspace link and special-file boundary risk; receipts remain bounded in memory.
- Documented that `authorization.allowed` is a positive match rather than an exhaustive allowlist.
- Added positive, negative, real ToolRuntime, and contract-validation regressions.

## 0.1.0-alpha.1 - 2026-08-31

- Initial unofficial DeepSeek Harness bundle.
- Added seven-field TaskContractLite and versioned provider projection support.
- Added deterministic continue, remind, ask, block, and bounded continue-verification behavior.
- Added frozen `tools/result` evidence, hashed receipts, real ToolRuntime/AgentLoop tests, and Windows/Linux/macOS CI.
- Kept shadow mode as the shipped default and disk persistence off by default.
