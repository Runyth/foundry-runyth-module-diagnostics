# Runyth Module Diagnostics 1.1.0 — Test Results

## Automated coverage

The v1.1.0 suite contains 41 Node tests covering the existing evidence/scanning/report functionality plus the new access model.

New access regression coverage includes:

- allow-list normalization and de-duplication;
- unconditional Game Master authorization;
- explicit non-GM authorization;
- exclusion of GM users from the selectable player list;
- stable player sorting and active-state extraction;
- stale/unknown/GM ID removal before persistence;
- non-GM rejection of world access writes;
- world-scoped hidden player-access setting registration;
- settings-menu availability for selected non-GM clients;
- minimal API exposure on an unauthorized client.

## Static/release gates

`tools/validate.mjs` additionally checks:

- access setting remains hidden and world-scoped;
- runtime dashboard authorization remains present;
- revocation closes the dashboard and uninstalls capture;
- Access navigation is GM-only;
- player selection is bounded/scrollable and aligned;
- access checkbox changes are GM guarded;
- persistence goes through the guarded access service;
- access-administration API methods are added only for GM clients;
- English/German localization key and placeholder parity;
- existing ApplicationV2 lifecycle, scan progress, package-path, compatibility, CSS isolation, no-private-API, no-prototype-patch, no-socket, and deterministic package constraints remain enforced.

## Manual acceptance

The release manual matrix adds grant, revoke, reconnect/regrant, independent evidence buffers, per-client window state, player API boundaries, and GM-only Access UI checks. Live Foundry execution is still required before claiming runtime acceptance in a production campaign world.
