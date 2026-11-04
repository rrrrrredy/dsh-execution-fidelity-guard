# Known limitations and deferred work

- DeepSeek Harness is a developer preview. The exact `0.1.2-alpha.2` compatibility range is intentional.
- Completion detection is a bounded text heuristic. It only requests more evidence; it never creates a deterministic action block.
- Only structured `action:`, `tool:`, and `command-prefix:` rules can block. Natural-language constraints produce reminders on high-risk candidates.
- Command classification is strongest for direct Harness shell calls. A custom composite tool can hide an internal side effect unless it exposes a meaningful tool name or routes subcalls through ToolRuntime.
- An absent or invalid contract makes the Guard advisory. Native Harness sandbox and permission controls remain authoritative.
- Receipt records are bounded in memory. Disk persistence is disabled in this alpha after adversarial review found that workspace-relative paths could cross a link or junction boundary.
- The shared contract accepts `file`, `command`, `test`, `api`, `database`, `real_page`, `release`, and `user` sources. This alpha automatically produces only the structured file, command, test, API, and real-page subset; unsupported or natural-language requirements remain missing without disabling action enforcement.
- The seven-field contract does not bind an expected release repository and tag, so release commands remain generic command evidence. GitHub release existence must be verified by the Host or user outside Guard.
- Test help, version, list, collection-only, `npm --if-present`, and compile-without-running forms such as `cargo test --no-run` do not satisfy `evidence:test`. A successful direct test result still proves only that the observed command exited successfully, not that the selected suite was semantically sufficient.
- Tool names such as `run_tests`, `list_tests`, or `test_connection` do not create test evidence by themselves.
- Shell evidence requires the official foreground result shape with an integer exit code. Background processes and success wrappers without an exit code remain unknown and cannot satisfy completion.
- The Guard does not capture hidden reasoning, full transcripts, arbitrary tool values, or approval history.
- No semantic model is bundled. Sparse semantic review remains future opt-in work and can never hard-block by itself.
- In `shadow`, pending-tool conflicts are reminders and completion gaps are
  recorded without turn steering. Only `balanced` denies deterministic
  conflicts, asks for user-owned choices, or steers bounded verification.
