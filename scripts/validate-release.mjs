// SPDX-License-Identifier: Apache-2.0
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseContractDocument } from "../src/contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "package.json", "index.mjs", "cordis.patch.yml", "README.md", "LICENSE", "NOTICE",
  "src/plugin.mjs", "src/contract.mjs", "src/classify.mjs", "src/policy.mjs",
  "src/evidence.mjs", "src/completion.mjs", "src/receipts.mjs",
  "spec/task-contract-lite.schema.json", "spec/receipt.schema.json",
  "examples/contracts/no-local-install.json", ".github/workflows/ci.yml",
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if ([".git", "node_modules", ".artifacts"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(full));
    else output.push(full);
  }
  return output;
}

const failures = [];
for (const relative of required) {
  try {
    if (!(await stat(path.join(root, relative))).isFile()) failures.push(relative + " is not a file");
  } catch {
    failures.push(relative + " is missing");
  }
}

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (pkg.name !== "dsh-execution-fidelity-guard") failures.push("unexpected package name");
if (pkg.version !== "0.1.0-alpha.2") failures.push("unexpected package version");
if (pkg.dsh?.bundle?.patch !== "./cordis.patch.yml") failures.push("missing dsh.bundle.patch");
if (pkg.engines?.node !== "^22.19.0 || >=24.0.0") failures.push("Node engine does not match DSH 0.1.2 alpha");
for (const script of ["preinstall", "install", "postinstall", "prepare", "prepack", "postpack"]) {
  if (script in (pkg.scripts ?? {})) failures.push("prohibited lifecycle script: " + script);
}
for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
  if (name.startsWith("@deepseek-ai/dsh-") && version !== "0.1.2-alpha.2") failures.push(name + " must pin 0.1.2-alpha.2");
}

const example = JSON.parse(await readFile(path.join(root, "examples/contracts/no-local-install.json"), "utf8"));
const parsed = parseContractDocument(example);
if (parsed.status !== "bound") failures.push("example contract is invalid: " + parsed.errors?.join("; "));

const sourceFiles = (await filesUnder(root)).filter((file) => file.endsWith(".mjs"));
for (const file of sourceFiles) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) failures.push(path.relative(root, file) + " syntax: " + check.stderr.trim());
}

const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
for (const action of workflow.matchAll(/uses:\s*([^\s]+)/g)) {
  if (!/@[a-f0-9]{40}$/i.test(action[1])) failures.push("GitHub Action is not pinned to a full SHA: " + action[1]);
}
for (const platform of ["ubuntu-latest", "windows-latest", "macos-latest"]) {
  if (!workflow.includes(platform)) failures.push("CI matrix missing " + platform);
}

if (failures.length) {
  console.error(failures.map((item) => "- " + item).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`release validation passed: ${required.length} required files, ${sourceFiles.length} JavaScript modules, 0 install hooks`);
}
