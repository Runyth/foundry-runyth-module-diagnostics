// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { RELEASE_ROOT, ROOT, sha256 } from "./lib/fs.mjs";

const first = path.join(ROOT, ".determinism-first");
const second = path.join(ROOT, ".determinism-second");
await rm(first, { recursive: true, force: true });
await rm(second, { recursive: true, force: true });

async function snapshot(destination) {
  await rm(RELEASE_ROOT, { recursive: true, force: true });
  const child = await import("node:child_process");
  child.execFileSync(process.execPath, [path.join(ROOT, "tools/build.mjs")], { cwd: ROOT, stdio: "ignore" });
  child.execFileSync(process.execPath, [path.join(ROOT, "tools/package.mjs")], { cwd: ROOT, stdio: "ignore" });
  await mkdir(destination, { recursive: true });
  await cp(RELEASE_ROOT, destination, { recursive: true });
}

await snapshot(first);
await snapshot(second);
const { readdir } = await import("node:fs/promises");
const firstFiles = (await readdir(first)).sort();
const secondFiles = (await readdir(second)).sort();
if (JSON.stringify(firstFiles) !== JSON.stringify(secondFiles)) {
  throw new Error(`Deterministic builds produced different artifact sets: ${firstFiles.join(", ")} vs ${secondFiles.join(", ")}`);
}
for (const name of firstFiles) {
  const left = path.join(first, name);
  const right = path.join(second, name);
  if ((await sha256(left)) !== (await sha256(right))) throw new Error(`Non-deterministic artifact: ${name}`);
}
await rm(first, { recursive: true, force: true });
await rm(second, { recursive: true, force: true });
console.log("Deterministic packaging verified.");
