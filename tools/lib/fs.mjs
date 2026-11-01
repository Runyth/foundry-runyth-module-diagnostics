// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const BUILD_ROOT = path.join(ROOT, "build");
export const MODULE_BUILD = path.join(BUILD_ROOT, "runyth-module-diagnostics");
export const RELEASE_ROOT = path.join(ROOT, "release");
export const FIXED_MTIME = new Date("2026-01-01T00:00:00.000Z");

export async function resetDirectory(directory) {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
}

export async function copyDirectory(source, destination) {
  await cp(source, destination, { recursive: true, force: true, preserveTimestamps: false });
}

export async function listFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === ".git") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(absolute, base));
    else if (entry.isFile()) output.push(path.relative(base, absolute).replaceAll(path.sep, "/"));
  }
  return output;
}

export async function sha256(file) {
  const hash = createHash("sha256");
  hash.update(await readFile(file));
  return hash.digest("hex");
}

export async function writeText(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, { encoding: "utf8" });
}

export async function fileExists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}
