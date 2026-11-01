// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { RingBuffer } from "../src/module/scripts/utils/ring-buffer.js";

test("RingBuffer retains newest values and counts discarded entries", () => {
  const buffer = new RingBuffer(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4);
  assert.deepEqual(buffer.values(), [2, 3, 4]);
  assert.equal(buffer.dropped, 1);
});

test("RingBuffer trims immediately when its limit is reduced", () => {
  const buffer = new RingBuffer(4);
  for (const value of [1, 2, 3, 4]) buffer.push(value);
  buffer.limit = 2;
  assert.deepEqual(buffer.values(), [3, 4]);
  assert.equal(buffer.dropped, 2);
});

test("RingBuffer clear resets content and discard accounting", () => {
  const buffer = new RingBuffer(1);
  buffer.push("a");
  buffer.push("b");
  buffer.clear();
  assert.deepEqual(buffer.values(), []);
  assert.equal(buffer.dropped, 0);
});
