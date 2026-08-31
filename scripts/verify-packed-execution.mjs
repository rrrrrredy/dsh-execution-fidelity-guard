// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(path.join(os.tmpdir(), "dsh-efg-pack-"));
const extract = path.join(temp, "extract");
await mkdir(extract);
try {
  const npmArgs = ["pack", "--json", "--pack-destination", temp];
  const packed = process.env.npm_execpath
    ? spawnSync(process.execPath, [process.env.npm_execpath, ...npmArgs], { cwd: root, encoding: "utf8" })
    : spawnSync("npm", npmArgs, { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
  if (packed.error) throw packed.error;
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout || "npm pack failed");
  const metadata = JSON.parse(packed.stdout);
  const filename = metadata[0]?.filename;
  if (!filename) throw new Error("npm pack did not return a filename");
  const archive = path.join(temp, filename);
  const untar = spawnSync("tar", ["-xf", archive, "-C", extract], { encoding: "utf8" });
  if (untar.status !== 0) throw new Error(untar.stderr || "tar extraction failed");
  const packageRoot = path.join(extract, "package");
  const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  for (const script of ["preinstall", "install", "postinstall", "prepare"]) {
    if (script in (pkg.scripts ?? {})) throw new Error("packed package contains prohibited lifecycle script: " + script);
  }
  const contractModule = await import(pathToFileURL(path.join(packageRoot, "src/contract.mjs")));
  const contract = JSON.parse(await readFile(path.join(packageRoot, "examples/contracts/no-local-install.json"), "utf8"));
  const parsed = contractModule.parseContractDocument(contract);
  if (parsed.status !== "bound") throw new Error("packed contract parser rejected the packaged example");
  const names = new Set(metadata[0].files.map((item) => item.path));
  for (const required of ["index.mjs", "cordis.patch.yml", "src/plugin.mjs", "spec/task-contract-lite.schema.json", "LICENSE"]) {
    if (!names.has(required)) throw new Error("packed artifact missing " + required);
  }
  console.log(`packed execution passed: ${metadata[0].entryCount} entries, ${metadata[0].size} bytes, install hooks absent`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
