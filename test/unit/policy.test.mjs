// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolAction } from "../../src/classify.mjs";
import { decidePreTool } from "../../src/policy.mjs";

function binding(overrides = {}) {
  return {
    status: "bound",
    envelope: { contract_ref: "lite:test", contract_version: 1 },
    contract: {
      authorization: { allowed: ["action:read"], requires_user: ["action:publish"], forbidden: ["action:install_local"] },
      must_and_must_not: { must: [], must_not: [] },
      ...overrides,
    },
  };
}

test("classifies installation across bash and PowerShell hosts", () => {
  for (const [name, command] of [
    ["bash", "npm install left-pad"],
    ["pwsh", "python -m pip install demo"],
    ["powershell", "winget install Demo.App"],
    ["bash", "python3.11 -m pip install pytest"],
    ["bash", "env -u CI npm install lodash"],
    ["bash", "env -C app npm install lodash"],
    ["bash", "npm --prefix . install lodash"],
    ["pwsh", "pip --disable-pip-version-check install pytest"],
    ["bash", "npm --loglevel warn install lodash"],
    ["bash", "pip --index-url https://example.invalid/simple install pytest"],
    ["bash", "python3.11 -m pip --index-url https://example.invalid/simple install pytest"],
    ["bash", "pnpm --filter app add lodash"],
    ["bash", "cargo --color always install ripgrep"],
    ["bash", "bash -lc \"npm install lodash\""],
    ["bash", "command -- npm install lodash"],
    ["bash", "command -p npm install lodash"],
    ["bash", "nohup -- npm install lodash"],
    ["bash", "nice -n 5 npm install lodash"],
    ["bash", "timeout 30 npm install lodash"],
    ["bash", "exec npm install lodash"],
    ["bash", "exec -a npm npm install lodash"],
    ["bash", "time npm install lodash"],
    ["bash", "time -f %e npm install lodash"],
    ["bash", "/usr/bin/time --output timing.txt npm install lodash"],
    ["bash", "sh -c \"exec npm install lodash\""],
    ["bash", "sh -c \"time -p npm install lodash\""],
    ["bash", "FOO=bar exec npm install lodash"],
    ["bash", "FOO=bar time npm install lodash"],
    ["bash", "FOO=bar time -p env CI=1 exec npm install lodash"],
    ["bash", String.raw`sh -c 'sh -c "sh -c \"npm install lodash\""'`],
    ["bash", String.raw`sh -c 'sh -c "sh -c \"sh -c \\\"npm install lodash\\\"\""'`],
    ["bash", "env env env env env env env env env npm install lodash"],
    ["bash", "env -S \"npm install lodash\""],
    ["bash", "env --split-string=\"npm install lodash\""],
    ["bash", "env -S npm\\ install\\ lodash"],
    ["bash", "env --split-string=npm\\ install\\ lodash"],
    ["bash", "sudo -H apt install jq"],
    ["bash", "sudo -E -H apt install jq"],
    ["bash", "sh -ec \"npm install lodash\""],
    ["bash", "bash -xec \"npm install lodash\""],
    ["bash", "npm add lodash"],
    ["bash", "yarn --cwd app dlx create-vite"],
    ["bash", "yarn global add typescript"],
    ["bash", "yarn global upgrade typescript"],
    ["bash", "dotnet tool update --global dotnet-ef"],
    ["bash", "npm update lodash"],
    ["bash", "pnpm update lodash"],
    ["bash", "yarn up lodash"],
    ["bash", "npm audit fix"],
    ["bash", "pnpm audit --fix"],
    ["bash", "npm rebuild"],
    ["bash", "pnpm rebuild"],
    ["bash", "uv add requests"],
    ["bash", "poetry add requests"],
    ["bash", "poetry update"],
    ["bash", "pipenv update"],
    ["bash", "bundle update"],
    ["bash", "gem update"],
    ["bash", "go get example.com/module@latest"],
    ["bash", "dotnet add package Example.Package"],
    ["bash", "conda update numpy"],
    ["bash", "brew upgrade jq"],
    ["pwsh", "winget upgrade Demo.App"],
    ["pwsh", "choco upgrade git"],
    ["bash", "apt upgrade"],
    ["bash", "dnf update"],
    ["bash", "yum upgrade"],
    ["bash", "cargo add serde"],
    ["bash", "cargo update"],
  ]) {
    const action = classifyToolAction({ name, arguments: { command } });
    assert.ok(action.tags.includes("install_local"), name + " should classify install");
    assert.equal(action.highRisk, true);
    assert.equal(decidePreTool({ binding: binding(), action, mode: "balanced" }).decision, "block");
  }
});

test("classifies dependency removal and update as workspace mutation", () => {
  for (const command of [
    "npm uninstall lodash",
    "pnpm --filter app remove lodash",
    "yarn global remove typescript",
    "dotnet tool uninstall --global dotnet-ef",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.ok(action.tags.includes("write_workspace"), command);
    assert.equal(
      decidePreTool({
        binding: binding({
          authorization: { allowed: [], requires_user: [], forbidden: ["action:write"] },
        }),
        action,
        mode: "balanced",
      }).decision,
      "block",
      command,
    );
  }
});

test("nearby read and test commands do not become local installs", () => {
  for (const command of [
    "npm --prefix . run test",
    "pip --disable-pip-version-check list",
    "pip --index-url https://example.invalid/simple list",
    "python3.11 -m pip list",
    "env -u CI npm test",
    "npm --loglevel warn test",
    "pnpm --filter app test",
    "cargo --color always test",
    "timeout --help",
    "nice -n 5 npm test",
    "exec npm test",
    "time -p npm test",
    "command -v npm install",
    "command -V npm install",
    "sh -e \"npm test\"",
    "bash -- \"npm install lodash\"",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.equal(action.tags.includes("install_local"), false, command);
  }
});

test("classifies common git writes and GitHub external mutations", () => {
  for (const command of [
    "git apply change.patch",
    "git cherry-pick deadbeef",
    "git stash",
    "git stash push",
    "git switch feature",
    "git worktree add ../worktree feature",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.ok(action.tags.includes("write_workspace"), command);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:write"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", command);
  }
  for (const command of [
    "gh secret set TOKEN",
    "gh workflow run ci.yml",
    "gh api -X POST repos/example/project/issues",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.ok(action.tags.includes("external_side_effect"), command);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:external"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", command);
  }
});

test("classifies core PowerShell file-writing cmdlets", () => {
  for (const command of [
    "Write-Output hi | Out-File note.txt",
    "Out-File -FilePath note.txt -InputObject hi",
    "Clear-Content note.txt",
    "Rename-Item old.txt new.txt",
    "Get-Process | Export-Csv processes.csv",
    "Get-Process | Export-Clixml processes.xml",
    "Start-Transcript transcript.txt",
  ]) {
    const action = classifyToolAction({ name: "pwsh", arguments: { command } });
    assert.ok(action.tags.includes("write_workspace"), command);
    assert.equal(action.reversible, false, command);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:write"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", command);
  }
});

test("classifies core POSIX file-writing commands", () => {
  for (const command of [
    "ln -s source target",
    "chmod 600 secret.txt",
    "chown user file.txt",
    "truncate -s 0 file.txt",
    "patch -p1 < changes.diff",
    "dd if=source.img of=target.img",
    "install source.bin destination.bin",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.ok(action.tags.includes("write_workspace"), command);
    assert.equal(action.reversible, false, command);
  }
  for (const command of [
    "chmod --help",
    "patch --dry-run -p1 < changes.diff",
    "dd if=source.img",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.equal(action.tags.includes("write_workspace"), false, command);
  }
});

test("classifies direct HTTP mutations as external side effects", () => {
  for (const command of [
    "curl -X POST https://example.invalid/items",
    "curl --data x=1 https://example.invalid/items",
    "curl -F file=@note.txt https://example.invalid/upload",
    "curl -T note.txt https://example.invalid/upload",
    "wget --post-data=x=1 https://example.invalid/items",
    "wget --method=DELETE https://example.invalid/items/1",
    "Invoke-RestMethod -Method Post https://example.invalid/items",
    "iwr -Method Delete https://example.invalid/items/1",
  ]) {
    const name = /Invoke|iwr/i.test(command) ? "pwsh" : "bash";
    const action = classifyToolAction({ name, arguments: { command } });
    assert.ok(action.tags.includes("external_side_effect"), command);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:external"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", command);
  }
  for (const [name, command] of [
    ["bash", "curl https://example.invalid/items"],
    ["bash", "curl -X HEAD https://example.invalid/items"],
    ["bash", "wget https://example.invalid/items"],
    ["pwsh", "irm -Method Get https://example.invalid/items"],
  ]) {
    const action = classifyToolAction({ name, arguments: { command } });
    assert.equal(action.tags.includes("external_side_effect"), false, command);
    assert.ok(action.tags.includes("network"), command);
  }
});

test("classifies direct Git deletion subcommands", () => {
  for (const command of [
    "git tag -d v1",
    "git stash drop",
    "git stash clear",
    "git worktree remove ../trial",
    "git worktree prune",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.ok(action.tags.includes("delete"), command);
    assert.ok(action.tags.includes("destructive"), command);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:delete"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", command);
  }
  const remote = classifyToolAction({
    name: "bash",
    arguments: { command: "git remote remove origin" },
  });
  assert.ok(remote.tags.includes("write_workspace"));
  for (const command of [
    "git push --delete origin feature",
    "git push origin :feature",
    "gh repo delete owner/repo --yes",
    "gh release delete v1 --yes",
    "gh api -X DELETE repos/owner/repo/issues/1",
    "curl -X DELETE https://example.invalid/items/1",
    "wget --method=DELETE https://example.invalid/items/1",
    "iwr -Method Delete https://example.invalid/items/1",
  ]) {
    const name = /iwr/i.test(command) ? "pwsh" : "bash";
    const action = classifyToolAction({ name, arguments: { command } });
    assert.ok(action.tags.includes("delete"), command);
    assert.ok(action.tags.includes("destructive"), command);
    assert.ok(action.tags.includes("external_side_effect"), command);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:delete"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", command);
  }
});

test("keeps git mutation neighbors read-only", () => {
  for (const command of ["git stash list", "git stash show", "git worktree list"]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.deepEqual(action.tags, ["read"], command);
    assert.equal(action.reversible, true, command);
  }
});

test("distinguishes git branch inspection from ref and config mutation", () => {
  for (const command of ["git branch", "git branch --list feature", "git branch --show-current"]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.deepEqual(action.tags, ["read"], command);
  }
  for (const command of [
    "git branch new-feature",
    "git branch -M main",
    "git branch --set-upstream-to=origin/main main",
  ]) {
    const action = classifyToolAction({ name: "bash", arguments: { command } });
    assert.ok(action.tags.includes("write_workspace"), command);
    assert.equal(action.reversible, false, command);
  }
});

test("classifies noun-verb named mutations without misclassifying read prefixes", () => {
  for (const name of [
    "mcp__codex_app__automation_update",
    "mcp__server__database_update",
    "mcp__server__update_preview",
  ]) {
    const action = classifyToolAction({ name, arguments: {} });
    assert.ok(action.tags.includes("external_side_effect"), name);
    assert.equal(decidePreTool({
      binding: binding({
        authorization: { allowed: [], requires_user: [], forbidden: ["action:external"] },
      }),
      action,
      mode: "balanced",
    }).decision, "block", name);
  }
  for (const name of ["mcp__server__list_updates", "mcp__server__get_update_status"]) {
    const action = classifyToolAction({ name, arguments: {} });
    assert.deepEqual(action.tags, ["read"], name);
  }
  for (const name of ["create_goal", "update_goal", "update_plan"]) {
    const action = classifyToolAction({ name, arguments: {} });
    assert.deepEqual(action.tags, ["read"], name);
  }
});

test("balanced blocks deterministic conflicts while shadow only reminds", () => {
  const action = classifyToolAction({ name: "bash", arguments: { command: "npm install left-pad" } });
  assert.equal(decidePreTool({ binding: binding(), action, mode: "balanced" }).decision, "block");
  const shadow = decidePreTool({ binding: binding(), action, mode: "shadow" });
  assert.equal(shadow.decision, "remind");
  assert.ok(shadow.reasonCodes.includes("shadow_would_block"));
});

test("uses native ask for user-owned publication authority", () => {
  const action = classifyToolAction({ name: "bash", arguments: { command: "git push origin main" } });
  const result = decidePreTool({ binding: binding(), action, mode: "balanced" });
  assert.equal(result.decision, "ask");
  assert.match(result.unlock, /Host/);
});

test("keeps reversible reads silent", () => {
  for (const exec of [{ name: "bash", arguments: { command: "rg --files" } }, { name: "pwsh", arguments: { command: "Get-Content README.md" } }]) {
    const action = classifyToolAction(exec);
    const result = decidePreTool({ binding: binding(), action, mode: "balanced" });
    assert.equal(result.decision, "continue");
    assert.equal(result.visibility, "silent");
  }
});

test("allowed is a positive match and unlisted actions continue unless separately constrained", () => {
  const action = classifyToolAction({ name: "pwsh", arguments: { command: "Set-Content output.txt hello" } });
  const result = decidePreTool({
    binding: binding({
      authorization: { allowed: ["action:read"], requires_user: [], forbidden: [] },
    }),
    action,
    mode: "balanced",
  });
  assert.ok(action.tags.includes("write_workspace"));
  assert.equal(result.decision, "continue");
  assert.deepEqual(result.reasonCodes, ["no_material_conflict"]);
});
