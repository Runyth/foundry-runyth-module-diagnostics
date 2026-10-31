// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { MODULE_BUILD, ROOT, copyDirectory, resetDirectory } from "./lib/fs.mjs";

await resetDirectory(MODULE_BUILD);
await copyDirectory(path.join(ROOT, "src/module"), MODULE_BUILD);
await mkdir(MODULE_BUILD, { recursive: true });
for (const file of ["CHANGELOG.md", "LICENSE", "README.md"]) {
  await cp(path.join(ROOT, file), path.join(MODULE_BUILD, file));
}
console.log(`Built module at ${MODULE_BUILD}`);
