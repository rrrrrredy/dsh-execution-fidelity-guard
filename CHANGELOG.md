# Changelog

## 0.1.0-alpha.2 - 2026-08-31

- Closed install-classification bypasses involving environment wrappers, global package-manager options, and versioned Python or pip executables.
- Closed additional direct-wrapper bypasses involving POSIX `exec` and common
  GNU, POSIX, and BSD `time` forms.
- Classified common dependency-changing add/update/upgrade, audit-fix, rebuild,
  and global-tool verbs as local installation; added core PowerShell/POSIX file
  writers, mutating HTTP calls, and explicit local or remote deletion forms.
- Removed automatic release evidence because the current contract cannot bind an expected repository and tag; release-like commands remain generic command evidence.
- Excluded help, version, list, and collection-only invocations from automatic test evidence.
- Removed tool-name-based test inference; only a supported direct shell test command with an authoritative foreground exit code can automatically satisfy test evidence.
- Read the official foreground shell `exitCode` instead of treating every ToolRuntime success wrapper as a passing process; nonzero, background, and missing exit status cannot prove completion.
- Preserved the canonical eight-source contract vocabulary; requirements without a DSH producer remain missing while structured action rules stay bound and enforceable.
- Disabled optional disk receipt persistence after adversarial review found a workspace link and special-file boundary risk; receipts remain bounded in memory.
- Documented that `authorization.allowed` is a positive match rather than an exhaustive allowlist.
- Added positive, negative, real ToolRuntime, and contract-validation regressions.
- Aligned shadow completion semantics with the Codex product: record the gap
  without steering; only balanced mode can request another verification turn.

## 0.1.0-alpha.1 - 2026-08-31

- Initial unofficial DeepSeek Harness bundle.
- Added seven-field TaskContractLite and versioned provider projection support.
- Added deterministic continue, remind, ask, block, and bounded continue-verification behavior.
- Added frozen `tools/result` evidence, hashed receipts, real ToolRuntime/AgentLoop tests, and Windows/Linux/macOS CI.
- Kept shadow mode as the shipped default and disk persistence off by default.
