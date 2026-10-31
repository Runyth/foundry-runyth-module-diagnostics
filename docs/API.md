# Public API

A minimal API is present after Foundry's `ready` hook. Full diagnostics methods are exposed only when the current client is a Game Master or an explicitly authorized player:

```javascript
const api = game.modules.get("runyth-module-diagnostics").api;
```

## Methods

| Method | Result | Description |
|---|---|---|
| `isAuthorized()` | boolean | Reports whether the current client is a GM or a selected player |
| `open()` | Application or `null` | Opens/focuses the dashboard; returns `null` when the current user is not authorized |
| `getCaptureState()` | object | Returns a plain capture-state snapshot |
| `getEntries(options?)` | array | Returns retained entries filtered by package selection, attribution option, and levels |
| `startCapture(options?)` | void | Starts focused capture |
| `stopCapture()` | void | Stops focused capture, restores its temporary console wrappers, and leaves background runtime-error capture governed by settings |
| `clearCapture()` | void | Clears the ring buffer and discarded count |
| `record(entry)` | object or `null` | Adds an explicit custom evidence item with force enabled |
| `getEnvironment()` | object | Returns a current environment/package snapshot |
| `runScan(name, selectedModuleIds?, options?)` | Promise<object> | Runs `relationships`, `assets`, `source`, `css`, `dom`, or `resources`; `options` may contain `signal` and `onProgress` |
| `runAllScans(selectedModuleIds?, options?)` | Promise<object> | Runs all scans sequentially with weighted aggregate progress |
| `buildReport(options?)` | object | Builds and redacts a report without downloading it |
| `exportReport(options?)` | object | Builds and downloads a ZIP, returning metadata and the report object |
| `getPlayerAccess()` | array | GM-only administration helper; returns selected non-GM user IDs |
| `setPlayerAccess(userIds)` | Promise<array> | GM-only administration helper; validates and persists selected non-GM user IDs |

The API version remains `2` in v1.1.1 (introduced in v1.1.0). Unauthorized clients receive only `version`, `isAuthorized()`, and `open()`. Authorized non-GM clients receive diagnostics methods but no access-administration methods. Game Masters additionally receive `getPlayerAccess()` and `setPlayerAccess(userIds)`.

## Capture options

```javascript
{
  selectedModuleIds: ["module-a", "module-b"],
  includeUnknown: true,
  levels: ["debug", "info", "log", "warn", "error"]
}
```

`selectedModuleIds: null` captures all package attributions. An empty array selects no attributed modules; `includeUnknown: true` may still retain events without a module path.

## Report options

```javascript
{
  selectedModuleIds: ["module-a"],
  includeUnknown: true,
  levels: ["warn", "error"],
  focusedSessionId: 3,
  includeAllPackages: false,
  summary: "A concise description",
  steps: "1. ...",
  expected: "...",
  actual: "...",
  customRedactions: ["exact private value"]
}
```

## Public hooks

| Hook | Arguments |
|---|---|
| `runyth-module-diagnostics.captureEntry` | `(entry)` after an entry is retained |
| `runyth-module-diagnostics.captureState` | `(state)` after capture state changes |
| `runyth-module-diagnostics.scanComplete` | `(name, result)` after a scan completes |
| `runyth-module-diagnostics.reportCreated` | `(report, filename)` after an export ZIP is created |

Consumers must treat returned snapshots as diagnostics data, not as authoritative proof that an attributed package caused an error.

`focusedSessionId` limits exported evidence to one focused reproduction session. `includeAllPackages: false` keeps the environment inventory scoped to selected active modules; set it to `true` only when the complete installed inventory is needed.

## Scan progress callback

`runScan` and `runAllScans` accept an advisory `onProgress` callback. Exceptions thrown by the callback are ignored so presentation code cannot break the scan.

```javascript
await api.runAllScans(["module-a"], {
  signal: controller.signal,
  onProgress: ({ percent, label, detail, stage }) => {
    console.log({ percent, label, detail, stage });
  }
});
```

Progress objects contain a bounded percentage plus descriptive stage/detail fields and, where meaningful, completed/total counters. Complete-suite percentages use fixed stage weights so expensive asset/source work is represented more accurately than a simple six-stage counter.
