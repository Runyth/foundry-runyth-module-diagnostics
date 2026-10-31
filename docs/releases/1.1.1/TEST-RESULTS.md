# Runyth Module Diagnostics 1.1.1 — Test Results

The patch adds a regression fixture containing one package with no compatibility metadata and one package whose compatibility value is malformed.

Expected behavior:

- report ZIP export completes;
- unavailable compatibility values render safely;
- focused-capture state does not affect report formatter correctness;
- existing capture, scan, access-control, serialization, redaction, and deterministic packaging tests continue passing.

The final release validation record contains the exact automated test count and packaging checks.
