# ADR-017: Character-level NOORIC shaper and aligned legacy codes

- **Status**: Accepted (experimental, opt-in)
- **Date**: 2026-11-11
- **Builds on**: ADR-007, ADR-011, ADR-014

## Context

Noori/Pashto text (cached run kind `0x7f8b`) was approximated by whole-word DAT
mappings plus saved-width fitting. Reverse engineering recovered the native
character-level path: 44-byte NOORIC records selected by `(code, form)`, a glyph
slot at `record+0x06`, and a face chosen by `record+0x04` (variant).

## Decision

- Add `NooricTextShaper`: computes joining forms, selects records, and emits
  glyphs through an injected resolver (independent of vendor fonts).
- Add `TextRun.charCodes`, aligned 1:1 with Unicode scalars (gaps undefined for
  ASCII/composites), and thread codes through the shape seam and cache key.
- Build a resolver in `tools/inpage-fonts.ts` from the local NOORIC fonts and
  `nooric-tables.json` (extracted by `fonts:import`).
- Keep the path **opt-in**. It currently regresses SAMPLE2 (81.22% vs 81.91%)
  because context-class matching, the runtime advance table, and the face rule
  are incomplete.

## Consequences

The shaper and code plumbing are tested and generic. Default rendering is
unchanged. Completing fidelity requires the class tables, the runtime-initialised
advance table, and validation against known reference words.
