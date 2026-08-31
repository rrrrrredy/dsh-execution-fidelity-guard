# Execution Fidelity Guard for DeepSeek Harness

An unofficial, buildless DeepSeek Harness bundle that checks a pending tool call against a small task contract and checks completion claims against current tool evidence.

It is deliberately narrower than a second agent loop. Planning, sandboxing, permissions, tool execution, conversation state, and the final user interaction remain owned by DeepSeek Harness.

> Alpha compatibility target: DeepSeek Harness `v0.1.2-alpha.2`. DeepSeek Harness is currently a developer preview and may make breaking changes.

## What it does

| Situation | Result |
|---|---|
| Low-cost, reversible read | Continues silently |
| Weak or natural-language risk signal | Adds a model-visible reminder |
| Structured rule says the user must decide | `shadow` reminds and proceeds; `balanced` returns Harness-native `ask` |
| Structured rule deterministically forbids the action | Denies the current call in `balanced` mode |
| Assistant claims completion without required evidence | `shadow` records the gap; `balanced` steers another verification step, at most twice |

No model call, network request, transcript upload, hidden-reasoning access, or telemetry is added by this package. Arguments are hashed in receipts rather than retained verbatim.

## Requirements and source preview

- Node.js 22.19 or Node.js 24 or later.
- DeepSeek Harness 0.1.2-alpha.2 for profile installation and live integration.
- Git for the source-preview path.

You can inspect the core policy and package without installing this bundle or DeepSeek Harness:

```sh
git clone https://github.com/rrrrrredy/dsh-execution-fidelity-guard.git
cd dsh-execution-fidelity-guard
npm test
npm run validate
npm run verify:pack
```

Those commands use the checked-in source and Node's standard library. They do not run `npm install` or change a Harness profile. The real ToolRuntime and AgentLoop integration suite runs in the six-job GitHub Actions matrix against the exact pinned Harness packages.

## Install into a Harness profile

Pin the release or an exact commit:

```sh
dsh plugin --profile <profile> add github:rrrrrredy/dsh-execution-fidelity-guard#v0.1.0-alpha.2
dsh --profile <profile> --dump-config
```

The package ships JavaScript directly and has no `prepare`, `install`, or `postinstall` script. A Git install therefore needs no package build permission.

The bundled default is `shadow`. Pending tool conflicts become non-blocking reminders, while missing completion evidence is recorded without steering or stopping the turn. After reviewing shadow behavior, override the row in the profile's `cordis.patch.yml` to enable enforcement and bounded completion steering:

```yaml
- insert:
    - id: execution-fidelity-guard
      name: dsh-execution-fidelity-guard
      config:
        mode: balanced
        contractPath: .execution-fidelity/contract.json
        maxContinuationAttempts: 2
```

Harness applies the profile patch after installed bundles. A later row with the same id replaces the whole configuration, so keep all three fields.

Remove it with:

```sh
dsh plugin --profile <profile> remove dsh-execution-fidelity-guard
```

## Add a task contract

Copy [`examples/contracts/no-local-install.json`](examples/contracts/no-local-install.json) to `.execution-fidelity/contract.json` in the agent workspace and edit its seven fields:

1. `objective`
2. `primary_object`
3. `delivery_surface`
4. `scope`
5. `must_and_must_not`
6. `authorization`
7. `completion_evidence`

Deterministic enforcement uses structured rules:

- `action:install_local`
- `action:publish`
- `action:destructive`
- `tool:<exact-tool-name>`
- `command-prefix:<exact-prefix>`

Natural-language constraints remain advisory. They never create a hard block by themselves.

`authorization.allowed` records a positive match; it is not an exhaustive allowlist. An unlisted action continues unless a matching rule also appears in `authorization.forbidden`, `authorization.requires_user`, or `must_and_must_not.must_not`. For example, `allowed: ["action:read"]` alone does not block workspace writes.

The shared contract accepts the canonical evidence-source vocabulary: `file`, `command`, `test`, `api`, `database`, `real_page`, `release`, and `user`, plus natural-language requirements. This DSH alpha automatically produces only structured `evidence:file`, `evidence:command`, `evidence:test`, `evidence:api`, and `evidence:real_page` matches. Requirements without an implemented producer stay missing; they never invalidate or weaken the contract's action rules.

A current successful `tools/result` must match a supported structured requirement; a newer failure replaces an older pass for that requirement. Test help, version, list, collection-only, `npm --if-present`, and compile-without-running forms such as `cargo test --no-run` do not satisfy `evidence:test`. For shell tools, a foreground integer exit code is required: zero passes, nonzero fails, and background or missing exit status remains unknown.

This alpha has no automatic `release`, `database`, or `user` evidence producer. The seven-field contract does not bind an expected release repository and tag, so a push, pull request, package publication, or release command remains generic command evidence and cannot prove the intended Release.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `mode` | `shadow` | `off`, `shadow`, or `balanced` |
| `contractPath` | `.execution-fidelity/contract.json` | Absolute path or workspace-relative contract path |
| `maxContinuationAttempts` | `2` | Completion-verification steering budget, from 0 to 2 |

Invalid configuration fails while the plugin loads. An absent or invalid contract leaves the Guard advisory; it does not invent authorization. Guard receipts remain bounded in memory in this alpha. Disk receipt persistence is disabled; a non-empty legacy `receiptPath` is rejected during plugin load.

## DeepSeek Harness integration

- `tools/pre-execute`: classifies `bash` on Linux/macOS and `pwsh` on Windows, then returns allow, deny, or native ask.
- `ctx.tools.guard()`: holds the deterministic owner veto after the extensible pre-execute waterfall.
- `tools/result`: observes the frozen authoritative outcome and records current evidence.
- `agent/turn-stopping`: inspects the current assistant message; only `balanced` can steer bounded verification, while `shadow` records the gap without steering.

See [integration contract](docs/integration-contract.md), [compatibility](docs/compatibility.md), and [known limitations](docs/limitations.md).

## Verification

The repository has two test layers:

```sh
npm test                  # zero-dependency core tests
npm run test:integration # real DeepSeek Harness ToolRuntime and AgentLoop
npm run validate
npm run verify:pack
```

CI executes all layers on Windows, Ubuntu, and macOS with Node 22.19 and Node 24. Local installation is not required to inspect or run the core tests.

## Status and evidence boundary

Green CI provides engineering evidence for the checked package shape, covered deterministic cases, receipt redaction, and source/runtime integration on the CI matrix. It does not prove complete privacy, installed-profile UX, real-world efficacy, or the PRD's 100-task shadow and 800-task controlled targets. Those require real traffic and cannot be replaced by synthetic tests or another model's score.

## License

Apache-2.0. DeepSeek Harness is a separate project with its own license and trademarks. This repository is not affiliated with or endorsed by DeepSeek.
