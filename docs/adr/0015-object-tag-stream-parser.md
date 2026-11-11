# ADR-015: Sequential object tag-stream parser

- **Status**: Accepted
- **Date**: 2026-11-11
- **Builds on**: ADR-014

## Context

`page-objects.ts` located drawing properties by scanning payload bytes for
group markers (`0x7e`, `0x05`). That tolerated malformed data but could read
across entry boundaries and made value widths implicit. Reverse engineering
recovered the real record grammar.

## Decision

Parse records sequentially: a 12-byte header (`kind:u16, id:u16, 2:u32,
length:u32`), a 6-byte payload prefix `80 00 FF FF FF FF`, then entries of
`key:u8, group:u8, value` where the width depends on group/key:

- group `0x7e`: 4 bytes for keys `00,01,02,03,05,1a,1b,1c`, else 2;
- group `0x03`: 4 bytes for keys `06,08`, else 2;
- group `0x05`: 4 bytes for keys `1..4`, else 2.

`0x1b` is a polygon byte count followed by 8-byte vertices; `0x1c` is the
per-vertex opcode array (move/line/close), not a curve kind. Image records
prepend an ASCII path header and keep the scan-based fallback until that header
is decoded.

## Consequences

Behavior is preserved for the supplied fixtures (tests and raster score
unchanged) while removing marker-scanning ambiguity. The image-record path
remains a documented exception.
