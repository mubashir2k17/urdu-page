# ADR-003: Font fallback and provider API

- **Status**: Superseded by ADR-007
- **Date**: 2026-08-30

## Context

Exact Nastaliq reproduction depends on InPage's proprietary fonts and shaping.
We must not bundle proprietary fonts, and must provide an open-font fallback
clearly distinguished from pixel-identical rendering.

## Decision

- Ship **Noto Sans Arabic** (OFL) as the default fallback, vendored with license.
- Provide a `FontProvider` API (`registerFontProvider`) so users can supply
  legitimately licensed InPage fonts (e.g. Noori Nastaliq) for closer fidelity.
- Keep fallback rendering clearly documented as fallback, not pixel-identical.

## Consequences

- Milestone 1 output is searchable but not visually faithful (no shaping/joining).
- Font embedding uses full embed (not subset) because fontkit crashes on complex
  Arabic GPOS tables; documented in `COMPATIBILITY.md`.

## Notes

Initially we vendored Noto Naskh Arabic, but fontkit's GPOS processor crashed on
its complex positioning tables during embedding. Noto Sans Arabic embeds cleanly
and still covers the Arabic/Urdu block, so it is the current fallback. Naskh
remains an option for phase 2 when we integrate a proper shaper.
