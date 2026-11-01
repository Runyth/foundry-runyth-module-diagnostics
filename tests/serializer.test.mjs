// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { stableStringify, toSerializable } from "../src/module/scripts/utils/serializer.js";

test("toSerializable detects cycles without recursive failure", () => {
  const value = { name: "actor" };
  value.self = value;
  assert.deepEqual(toSerializable(value), {
    name: "actor",
    self: "[Circular $root]"
  });
});

test("toSerializable bounds depth and array length", () => {
  const value = { nested: { nested: { value: 1 } }, list: [1, 2, 3, 4] };
  const result = toSerializable(value, { depth: 2, arrayItems: 2 });
  assert.equal(result.nested.nested, "[Maximum depth 2]");
  assert.deepEqual(result.list, [1, 2, "[Truncated 2 items]"]);
});

test("toSerializable preserves useful Error information", () => {
  const error = new Error("failure");
  const result = toSerializable(error);
  assert.equal(result.name, "Error");
  assert.equal(result.message, "failure");
  assert.match(result.stack, /failure/u);
});

test("stableStringify orders object keys recursively", () => {
  assert.equal(stableStringify({ z: 1, a: { y: 2, b: 3 } }), '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}');
});
