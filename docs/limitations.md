# Known limitations and deferred work

- DeepSeek Harness is a developer preview. The exact `0.1.2-alpha.2` compatibility range is intentional.
- Completion detection is a bounded text heuristic. It only requests more evidence; it never creates a deterministic action block.
- Only structured `action:`, `tool:`, and `command-prefix:` rules can block. Natural-language constraints produce reminders on high-risk candidates.
- Command classification is strongest for direct Harness shell calls. A custom composite tool can hide an internal side effect unless it exposes a meaningful tool name or routes subcalls through ToolRuntime.
- An absent or invalid contract makes the Guard advisory. Native Harness sandbox and permission controls remain authoritative.
- Receipt records are bounded in memory. Disk persistence is disabled in this alpha after adversarial review found that workspace-relative paths could cross a link or junction boundary.
- Supported completion evidence kinds are `file`, `command`, `test`, `api`, `real_page`, and `release`. There is no `database` or `user` evidence producer in this alpha.
- `evidence:release` recognizes only a direct successful `gh release create` or `gh release view`; a push, pull request, or package publication is insufficient.
- The Guard does not capture hidden reasoning, full transcripts, arbitrary tool values, or approval history.
- No semantic model is bundled. Sparse semantic review remains future opt-in work and can never hard-block by itself.
- No installed-client UI walkthrough has been performed on the user's machine because the delivery requirement prohibits local installation.
- The PRD's 100 shadow tasks, 800 controlled tasks, efficacy thresholds, semantic latency, token cost, and user-time targets remain unverified until real online evaluation exists.
