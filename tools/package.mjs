// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  MODULE_BUILD,
  RELEASE_ROOT,
  ROOT,
  fileExists,
  sha256,
  writeText
} from "./lib/fs.mjs";
import { zipDirectory } from "./lib/zip.mjs";

const manifestFile = path.join(MODULE_BUILD, "module.json");
if (!await fileExists(manifestFile)) throw new Error("Build is missing. Run npm run build first.");
const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(manifestFile, "utf8"));
const version = manifest.version;
  const installName = `runyth-module-diagnostics-v${version}-mod.zip`;
  const sourceName = `runyth-module-diagnostics-v${version}-src.zip`;
  const documentationName = `runyth-module-diagnostics-v${version}-doc.zip`;
const installFile = path.join(RELEASE_ROOT, installName);
const sourceFile = path.join(RELEASE_ROOT, sourceName);
const documentationFile = path.join(RELEASE_ROOT, documentationName);
await mkdir(RELEASE_ROOT, { recursive: true });

await zipDirectory({
  source: MODULE_BUILD,
  destination: installFile,
  rootName: "runyth-module-diagnostics"
});

const ignoredRoots = new Set([".git", "build", "node_modules", "release"]);
await zipDirectory({
  source: ROOT,
  destination: sourceFile,
  rootName: `runyth-module-diagnostics-v${version}-src`,
  filter: (relative) => {
    const top = relative.split("/")[0];
    return !ignoredRoots.has(top) && !top.startsWith(".determinism-");
  }
});

const documentationFiles = new Set(["README.md", "CHANGELOG.md", "LICENSE", "SECURITY.md", "CONTRIBUTING.md"]);
await zipDirectory({
  source: ROOT,
  destination: documentationFile,
  rootName: `runyth-module-diagnostics-v${version}-doc`,
  filter: (relative) => documentationFiles.has(relative) || relative.startsWith("docs/")
});

const checksums = [
  `${await sha256(installFile)}  ${installName}`,
  `${await sha256(sourceFile)}  ${sourceName}`,
  `${await sha256(documentationFile)}  ${documentationName}`
].join("\n") + "\n";
await writeText(path.join(RELEASE_ROOT, `runyth-module-diagnostics-v${version}-SHA256SUMS.txt`), checksums);
console.log(`Packaged ${installName}`);
console.log(`Packaged ${sourceName}`);
console.log(`Packaged ${documentationName}`);
