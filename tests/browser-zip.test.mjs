// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { createZip } from "../src/module/scripts/utils/browser-zip.js";

test("createZip is deterministic for a fixed timestamp and sorted entries", async () => {
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  const left = new Uint8Array(await createZip({ "z.txt": "z", "a.txt": "a" }, { timestamp }).arrayBuffer());
  const right = new Uint8Array(await createZip({ "a.txt": "a", "z.txt": "z" }, { timestamp }).arrayBuffer());
  assert.deepEqual(left, right);
  assert.equal(Buffer.from(left).readUInt32LE(0), 0x04034b50);
  assert.equal(Buffer.from(left).readUInt32LE(left.length - 22), 0x06054b50);
});

test("createZip writes the expected entry count", async () => {
  const bytes = Buffer.from(await createZip({ "one.txt": "1", "two.txt": "2" }, { timestamp: new Date("2026-01-01T00:00:00Z") }).arrayBuffer());
  assert.equal(bytes.readUInt16LE(bytes.length - 12), 2);
});
