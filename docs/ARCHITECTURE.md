# Architecture

## Design constraints

The module is intentionally a client-side evidence and review tool. Its first responsibility is to avoid becoming another source of interference.

- It activates for Game Masters and only the non-GM users explicitly selected by a Game Master in the world-scoped access setting.
- It adds only one settings-menu ApplicationV2 launcher plus its owned diagnostics dashboard; the dashboard contains a GM-only Access tab.
- It does not register scene controls, token HUD controls, sheet controls, chat controls, canvas interactions, sockets, or keybindings.
- It does not mutate Foundry or third-party prototypes.
- It does not inspect Foundry's private hook registry.
- It does not enable, disable, update, or reconfigure third-party packages.
- It performs no periodic package scans. Scans run only after explicit user action.
- It keeps all evidence and imported files in client memory until export or page refresh.

## Components

### Access control

The world setting stores only selected non-GM Foundry user IDs. Game Masters are always authorized. Each client independently evaluates authorization before installing services. Granting access initializes that client on setting synchronization; revoking access closes its dashboard, uninstalls listeners/observers and temporary console wrappers, and drops the in-memory service instance. No sockets or shared evidence store are involved.

### CaptureService

Owns capturing resource/error listeners, the Foundry public `error` hook, the optional long-task observer, focused-session boundaries, filtering, a bounded ring buffer, and temporary console wrappers. Console methods are never wrapped by background capture. Focused capture wraps only the requested levels, calls each pre-existing console function first, records a caller stack for attribution, and restores a function only when the currently installed function is still the module's own wrapper.

### Serializer

Converts unknown runtime values to plain data using explicit limits for recursion depth, array length, object key count, and string length. A `WeakMap` detects cycles. Live DOM nodes are represented by short descriptors rather than traversed.

### Attribution

Extracts package references only from recognizable `/modules/<id>/` and `/systems/<id>/` paths in source URLs, stack strings, locations, and messages. It emits confidence and limitation metadata; attribution is never labeled as causality.

### DiagnosticsService

Produces an environment snapshot and explicit scans. Foundry V13 package assets are normalized whether package metadata exposes raw manifest-relative paths or already-rooted `modules/<id>/...` paths. Compatibility reads use the modern `compatibility` object and defensively avoid legacy pre-V10 core-version shims. Asset source is cached only in a private in-memory map and is omitted from scan results and reports. Every source/static scan has hard per-asset, asset-count, total-cache, DOM-node, resource-count, and finding-count bounds.

### ReportService

Builds a plain structured report, applies redaction recursively, renders an issue-ready Markdown summary, and writes a dependency-free browser ZIP. Imported text is redacted only at export so users can revise exact redaction terms before creating the package.

### DiagnosticsApp

Uses ApplicationV2 with HandlebarsApplicationMixin. All styles are prefixed by the stable application class. DOM listeners are attached only to the application's owned root and use an AbortController per render. Public hook-driven refreshes are debounced. The Scans tab reserves a fixed progress region at all times; progress values are updated in place without a full application re-render so scan activity does not move the surrounding layout.

## Data lifecycle

1. The current client is authorized as a Game Master or explicitly selected player, then its local services are installed.
2. A client event is captured after the service is installed.
3. The serializer bounds and normalizes its values.
4. Attribution derives package references from available text paths.
5. Filtering decides whether the event belongs in background or focused capture.
6. The ring buffer retains it or discards the oldest item.
7. Explicit scans add independent structured findings.
8. Report construction selects entries and packages.
9. Recursive redaction produces the exportable representation.
10. The browser creates a local ZIP and initiates a user download.

No report data is transmitted by the module.
