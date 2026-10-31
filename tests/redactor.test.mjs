// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { redactSerializable, redactText } from "../src/module/scripts/utils/redactor.js";

test("redactText removes common credentials and network identifiers", () => {
  const source = "Bearer abc.def token=secret https://private.example/path?key=value 192.168.1.10";
  const result = redactText(source);
  assert.doesNotMatch(result, /abc\.def|secret|private\.example|192\.168\.1\.10/u);
  assert.match(result, /\[REDACTED\]|\[HOST\]|\[IP_ADDRESS\]/u);
});

test("redactText replaces user-provided exact values case-insensitively", () => {
  assert.equal(redactText("World ALPHA alpha", ["alpha"]), "World [REDACTED_CUSTOM] [REDACTED_CUSTOM]");
});

test("redactSerializable recursively redacts keys and values", () => {
  const result = redactSerializable({ "api_key=secret": ["10.0.0.1", "private-value"] }, ["private-value"]);
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /secret|10\.0\.0\.1|private-value/u);
});
