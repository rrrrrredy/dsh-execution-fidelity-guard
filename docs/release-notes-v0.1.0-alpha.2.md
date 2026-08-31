# v0.1.0-alpha.2

Security and evidence-integrity patch for the unofficial DeepSeek Harness adapter.

This release closes environment, scheduling, `exec`, `time`, global-option, and common dependency-changing manager bypasses; covers direct PowerShell/POSIX writers, HTTP mutations, and explicit deletion forms; reads the official foreground shell exit code instead of trusting a success wrapper; removes automatic release evidence that could not be bound to an expected repository and tag; excludes help, list, `--if-present`, and compile-without-running invocations from test evidence; preserves the shared canonical evidence vocabulary without pretending every source has a DSH producer; and disables workspace-path disk receipts. It also documents the non-exhaustive semantics of `authorization.allowed` and keeps shadow completion gaps non-intervening.

The adapter remains pinned to DeepSeek Harness `v0.1.2-alpha.2`. Windows, Ubuntu, and macOS CI run the core suite, real ToolRuntime and AgentLoop integration tests, release validation, and packed execution on Node 22.19 and Node 24.

The local zero-install candidate passed 31 unit tests, release validation, and
a 23-entry packed-execution check with no install lifecycle scripts. The exact
release commit must also pass all six public Harness integration jobs before
the prerelease is published.

The release does not establish real-world efficacy, false-positive rate, installed-client UX, or the outstanding 100-task shadow and 800-task controlled targets.
