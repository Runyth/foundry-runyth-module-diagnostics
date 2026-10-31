// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { matchKnownIssues } from "../src/module/scripts/core/known-issues.js";

test("matchKnownIssues recognizes MIME/404 evidence", () => {
  const matches = matchKnownIssues([{ message: "Refused to apply style because its MIME type text/html is not supported", stack: "", location: "" }]);
  assert(matches.some((issue) => issue.id === "asset-404-or-mime"));
});

test("matchKnownIssues recognizes recursive deep-freeze failure", () => {
  const matches = matchKnownIssues([{ message: "Maximum call stack size exceeded", stack: "at deepFreeze (object.js:8)", location: "" }]);
  assert(matches.some((issue) => issue.id === "recursive-freeze-cycle"));
});
