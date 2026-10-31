// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
export const MODULE_ID = "runyth-module-diagnostics";
export const MODULE_TITLE = "Runyth Module Diagnostics";
export const MODULE_VERSION = "1.1.1";

export const CAPTURE_LEVELS = Object.freeze(["debug", "info", "log", "warn", "error"]);
export const DEFAULT_MAX_ENTRIES = 2_000;
export const MAX_CAPTURE_ENTRIES = 10_000;
export const MAX_IMPORTED_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_SERIALIZATION_DEPTH = 6;
export const MAX_ARRAY_ITEMS = 100;
export const MAX_OBJECT_KEYS = 100;
export const MAX_STRING_LENGTH = 20_000;
export const MAX_ASSET_SCAN_BYTES = 2 * 1024 * 1024;
export const MAX_ASSET_SCAN_COUNT = 500;
export const MAX_SOURCE_CACHE_BYTES = 20 * 1024 * 1024;
export const MAX_SCAN_FINDINGS = 1_000;

export const HOOKS = Object.freeze({
  CAPTURE_ENTRY: `${MODULE_ID}.captureEntry`,
  CAPTURE_STATE: `${MODULE_ID}.captureState`,
  REPORT_CREATED: `${MODULE_ID}.reportCreated`,
  SCAN_COMPLETE: `${MODULE_ID}.scanComplete`
});

export const REPORT_SCHEMA_VERSION = 1;
