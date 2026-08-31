# Execution Fidelity Guard for DeepSeek Harness

An unofficial, buildless DeepSeek Harness bundle that checks a pending tool call against a small task contract and checks completion claims against current tool evidence.

It is deliberately narrower than a second agent loop. Planning, sandboxing, permissions, tool execution, conversation state, and the final user interaction remain owned by DeepSeek Harness.

> Alpha compatibility target: DeepSeek Harness `v0.1.2-alpha.2`. DeepSeek Harness is currently a developer preview and may make breaking changes.

## What it does

| Situation | Result |
|---|---|
| Low-cost, reversible read | Continues silently |
| Weak or natural-language risk signal | Adds a model-visible reminder |
| Structured rule says the user must decide | Returns Harness-native `ask` |
| Structured rule deterministically forbids the action | Denies the current call in `balanced` mode |
| Assistant claims completion without required evidence | Steers one more verification step, at most twice |

No model call, network request, transcript upload, hidden-reasoning access, or telemetry is added by this package. Arguments are hashed in receipts rather than retained verbatim.

## Install into a Harness profile

Pin the release or an exact commit:

```sh
dsh plugin --profile <profile> add github:rrrrrredy/dsh-execution-fidelity-guard#v0.1.0-alpha.1
dsh --profile <profile> --dump-config
```

The package ships JavaScript directly and has no `prepare`, `install`, or `postinstall` script. A Git install therefore needs no package build permission.

The bundled default is `shadow`. It observes deterministic conflicts and reminds the model without stopping the action. After reviewing shadow behavior, override the row in the profile's `cordis.patch.yml` to enable enforcement:

```yaml
- insert:
    - id: execution-fidelity-guard
      name: dsh-execution-fidelity-guard
      config:
        mode: balanced
        contractPath: .execution-fidelity/contract.json
        receiptPath: ''
        maxContinuationAttempts: 2
```

Harness applies the profile patch after installed bundles. A later row with the same id replaces the whole configuration, so keep all four fields.

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

Completion evidence requirements use `evidence:<kind>` with one of `file`, `command`, `test`, `api`, `database`, `real_page`, `release`, or `user`. A current successful `tools/result` must match the requirement; a newer failure replaces an older pass for that requirement.

## Configuration

| Field | Default | Meaning |
|---|---:|---|
| `mode` | `shadow` | `off`, `shadow`, or `balanced` |
| `contractPath` | `.execution-fidelity/contract.json` | Absolute path or workspace-relative contract path |
| `receiptPath` | empty | Optional NDJSON receipt path; empty keeps disk persistence off |
| `maxContinuationAttempts` | `2` | Completion-verification steering budget, from 0 to 2 |

Invalid configuration fails while the plugin loads. An absent or invalid contract leaves the Guard advisory; it does not invent authorization.

## DeepSeek Harness integration

- `tools/pre-execute`: classifies `bash` on Linux/macOS and `pwsh` on Windows, then returns allow, deny, or native ask.
- `ctx.tools.guard()`: holds the deterministic owner veto after the extensible pre-execute waterfall.
- `tools/result`: observes the frozen authoritative outcome and records current evidence.
- `agent/turn-stopping`: inspects the current assistant message and can steer bounded verification.

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

This alpha proves package shape, deterministic behavior, real Harness composition, bounded continuation, privacy properties, and cross-platform execution when its CI is green. It does not yet prove the PRD's 100-task shadow or 800-task controlled efficacy targets. Those require real traffic and cannot be replaced by synthetic tests or another model's score.

## License

Apache-2.0. DeepSeek Harness is a separate project with its own license and trademarks. This repository is not affiliated with or endorsed by DeepSeek.

