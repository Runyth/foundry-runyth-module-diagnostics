// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeEvidence,
  entryMatchesSelection,
  extractPackageReferences
} from "../src/module/scripts/utils/attribution.js";

test("extractPackageReferences deduplicates modules and systems", () => {
  assert.deepEqual(
    extractPackageReferences(
      "https://host/modules/example/scripts/main.js",
      "at https://host/modules/example/scripts/other.js\nhttps://host/systems/dnd5e/module.js"
    ),
    [
      { packageType: "module", id: "example" },
      { packageType: "system", id: "dnd5e" }
    ]
  );
});

test("attributeEvidence assigns high confidence to an explicit source URL", () => {
  const result = attributeEvidence({ sourceUrl: "https://host/modules/example/main.js" });
  assert.equal(result.primaryModuleId, "example");
  assert.equal(result.confidence, "high");
  assert.match(result.note, /does not prove root cause/u);
});

test("entryMatchesSelection distinguishes all, none, and unattributed", () => {
  const attributed = { attribution: { references: [{ packageType: "module", id: "example" }] } };
  const unknown = { attribution: { references: [] } };
  assert.equal(entryMatchesSelection(attributed, null, false), true);
  assert.equal(entryMatchesSelection(attributed, [], true), false);
  assert.equal(entryMatchesSelection(unknown, [], true), true);
  assert.equal(entryMatchesSelection(unknown, [], false), false);
});


test("extractPackageReferences tolerates malformed encoding and cyclic evidence", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.deepEqual(extractPackageReferences("/modules/bad%ZZ/main.js", cyclic), [
    { packageType: "module", id: "bad%ZZ" }
  ]);
});
