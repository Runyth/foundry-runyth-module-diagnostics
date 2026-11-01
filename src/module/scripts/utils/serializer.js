// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  MAX_ARRAY_ITEMS,
  MAX_OBJECT_KEYS,
  MAX_SERIALIZATION_DEPTH,
  MAX_STRING_LENGTH
} from "../core/constants.js";

function truncateString(value, maximum = MAX_STRING_LENGTH) {
  if (value.length <= maximum) return value;
  return `${value.slice(0, maximum)}… [truncated ${value.length - maximum} characters]`;
}

function describeDomNode(value) {
  const tag = value.tagName?.toLowerCase?.() ?? "node";
  const id = value.id ? `#${value.id}` : "";
  const classes = value.classList?.length ? `.${[...value.classList].join(".")}` : "";
  return `[DOM ${tag}${id}${classes}]`;
}

export function toSerializable(value, options = {}) {
  const limits = {
    depth: options.depth ?? MAX_SERIALIZATION_DEPTH,
    arrayItems: options.arrayItems ?? MAX_ARRAY_ITEMS,
    objectKeys: options.objectKeys ?? MAX_OBJECT_KEYS,
    stringLength: options.stringLength ?? MAX_STRING_LENGTH
  };
  const seen = new WeakMap();

  const visit = (current, depth, path) => {
    if (current === null || current === undefined) return current ?? null;

    const type = typeof current;
    if (type === "string") return truncateString(current, limits.stringLength);
    if (type === "number" || type === "boolean") return current;
    if (type === "bigint") return `${current.toString()}n`;
    if (type === "symbol") return current.toString();
    if (type === "function") return `[Function ${current.name || "anonymous"}]`;

    if (current instanceof Error) {
      return {
        name: current.name,
        message: truncateString(current.message || String(current), limits.stringLength),
        stack: truncateString(current.stack || "", limits.stringLength),
        cause: depth < limits.depth ? visit(current.cause, depth + 1, `${path}.cause`) : "[Maximum depth]"
      };
    }

    if (typeof Node !== "undefined" && current instanceof Node) return describeDomNode(current);
    if (current instanceof Date) return Number.isNaN(current.getTime()) ? "Invalid Date" : current.toISOString();
    if (current instanceof RegExp) return current.toString();
    if (current instanceof URL) return current.toString();
    if (current instanceof Map) {
      if (seen.has(current)) return `[Circular ${seen.get(current)}]`;
      seen.set(current, path);
      return {
        type: "Map",
        entries: [...current.entries()]
          .slice(0, limits.arrayItems)
          .map(([key, item], index) => [visit(key, depth + 1, `${path}.key${index}`), visit(item, depth + 1, `${path}.value${index}`)])
      };
    }
    if (current instanceof Set) {
      if (seen.has(current)) return `[Circular ${seen.get(current)}]`;
      seen.set(current, path);
      return {
        type: "Set",
        values: [...current.values()]
          .slice(0, limits.arrayItems)
          .map((item, index) => visit(item, depth + 1, `${path}.${index}`))
      };
    }
    if (current instanceof ArrayBuffer) return `[ArrayBuffer ${current.byteLength} bytes]`;
    if (ArrayBuffer.isView(current)) return `[${current.constructor.name} ${current.byteLength} bytes]`;

    if (depth >= limits.depth) return `[Maximum depth ${limits.depth}]`;
    if (seen.has(current)) return `[Circular ${seen.get(current)}]`;
    seen.set(current, path);

    if (Array.isArray(current)) {
      const result = current
        .slice(0, limits.arrayItems)
        .map((item, index) => visit(item, depth + 1, `${path}[${index}]`));
      if (current.length > limits.arrayItems) {
        result.push(`[Truncated ${current.length - limits.arrayItems} items]`);
      }
      return result;
    }

    const result = {};
    const keys = Reflect.ownKeys(current).slice(0, limits.objectKeys);
    for (const key of keys) {
      const name = typeof key === "symbol" ? key.toString() : key;
      try {
        result[name] = visit(current[key], depth + 1, `${path}.${name}`);
      } catch (error) {
        result[name] = `[Unreadable: ${error instanceof Error ? error.message : String(error)}]`;
      }
    }
    const ownKeyCount = Reflect.ownKeys(current).length;
    if (ownKeyCount > limits.objectKeys) {
      result.__truncatedKeys = ownKeyCount - limits.objectKeys;
    }
    return result;
  };

  try {
    return visit(value, 0, "$root");
  } catch (error) {
    return `[Serialization failed: ${error instanceof Error ? error.message : String(error)}]`;
  }
}

export function stableStringify(value, spacing = 2) {
  const sort = (current) => {
    if (Array.isArray(current)) return current.map(sort);
    if (!current || typeof current !== "object") return current;
    return Object.fromEntries(Object.keys(current).sort().map((key) => [key, sort(current[key])]));
  };
  return JSON.stringify(sort(toSerializable(value)), null, spacing);
}
