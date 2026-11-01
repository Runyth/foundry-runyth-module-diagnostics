// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { rm } from "node:fs/promises";
import { BUILD_ROOT, RELEASE_ROOT } from "./lib/fs.mjs";

await Promise.all([
  rm(BUILD_ROOT, { recursive: true, force: true }),
  rm(RELEASE_ROOT, { recursive: true, force: true })
]);
