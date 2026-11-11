# ADR-014: Evidence-driven decoding from the vendor binary

- **Status**: Accepted
- **Date**: 2026-11-11
- **Builds on**: ADR-011, ADR-012, ADR-013

## Context

The reference audit did not reproduce the documented fidelity, and several
renderer paths had drifted into fixture-specific hardcoding (object-id branches,
literal coordinates). The only ground truth for undocumented behavior is the
shipped InPage application, which is installed locally.

## Decision

Use [REA](https://github.com/morluto/rea) + Ghidra 12.1.4 to analyze
`Inpage 2018_original.exe` (SHA-256 `ce5ee2e7…59e`) and record findings as text
evidence under `docs/reverse-engineering/`. Never commit the executable, the
vendor font/data files, or the reference PDFs. REA runs under a separate
supported Node (22 LTS); the CLI re-imports the binary per query, while the MCP
server keeps the target loaded.

Bulk decompilation is done once with `rea decompile-all`; table extraction is
reproducible with `tools/extract-nooric-table.ts` and `tools/dump-inp-objects.ts`.

## Consequences

- Findings are reproducible from the documented address/offset evidence.
- The workflow needs a local Ghidra + JDK 21 + Node 22 and is not part of CI.
- Evidence is text only; derived tables are written under ignored `tmp/` or the
  local vendor directory, never committed.
