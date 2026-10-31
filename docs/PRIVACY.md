# Privacy and evidence handling

## Local-only operation

All capture, scanning, imported evidence, redaction, and ZIP generation occur independently in each authorized user's browser. The module has no telemetry, remote API, socket traffic, shared evidence store, or automatic upload feature. A player must explicitly export and send a report ZIP to the Game Master or an issue tracker.

## Authorization data

The world stores the Foundry user IDs of players whom a Game Master has allowed to use diagnostics. It does not store their captured evidence. Game Masters are always authorized.

## Captured data may include

- console messages and serialized console arguments captured during explicit focused capture;
- error messages, stacks, source URLs, and locations;
- Foundry public error-hook data;
- CSP violation details;
- browser performance/resource data;
- package identifiers, versions, authors, compatibility metadata, manifest URLs, and flags;
- world identifier, active system identifier/version, current scene identifier, user role, browser user-agent, viewport, and hardware hints;
- text files explicitly imported by the user.

## Automatic redaction

The exporter attempts to replace:

- bearer tokens;
- common token, secret, password, API-key, and authorization assignments;
- credential-like URL query parameters;
- IPv4 and IPv6 addresses;
- URL hosts/origins;
- exact custom terms entered by the user.

Automatic redaction is necessarily heuristic. Usernames, world names, document names, chat content, filesystem fragments, custom domains, and uncommon credential formats may remain.

## Required user review

Open and inspect every generated file before uploading it to a public or third-party issue tracker. Add exact custom redaction terms and export again when necessary.

## Retention

Captured and imported data remains only in the current authorized client's page memory. Clearing the capture removes retained events. Refreshing or closing the browser page removes all unsaved evidence and imports.
