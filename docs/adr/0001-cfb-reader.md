# ADR-001: Own CFB reader vs. wrapping SheetJS `cfb`

- **Status**: Accepted
- **Date**: 2026-08-30

## Context

The brief requires treating every `.inp` as hostile: configurable file/stream/
object/decompression limits, integer-overflow and out-of-bounds protection, and
cycle detection in linked structures. We evaluated wrapping SheetJS `cfb`
(Apache-2.0) versus writing a defensive read-only reader.

## Decision

Write our own read-only CFB reader in `packages/cfb`. Cross-validate against
SheetJS `cfb` in dev-only tests.

## Rationale

- We control bounds checks, limits, and cycle detection precisely.
- Read-only path only (no write/repair), which shrinks the attack surface.
- `cfb` is a heavier general-purpose library; a focused reader is smaller and
  auditable.
- Apache-2.0 is compatible, so cross-validation is clean.

## Consequences

- More code to maintain, but fully tested (truncated header, cyclic FAT, OOB).
- Mini-stream handling is the trickiest part; unit-tested against real fixtures.
