# ADR-013: Native font output and optional printer placement

- **Status**: Accepted (experimental local font profile)
- **Date**: 2026-09-11
- **Builds on**: ADR-011, ADR-012

## Context

The original Windows export renders some supplied Noori banks as vector paths
and quantizes ordinary glyph origins to its printer grid. Full embedding and
unquantized placement produced visible differences even with matching glyphs.

## Decision

The PDF backend uses filled original outlines when the font's OS/2 noEmbedding
bit is set. Invisible standard-font placeholders carry ActualText; the flagged
font bytes are not embedded. Outlined text continues to stroke font paths.

Expose optional `RenderTypography.glyphPositionDpi` for integer printer glyph
origins. Full precision remains the default API behavior. The imported legacy
profile selects 600 dpi to reproduce the inspected Windows print path, with
caller override available. The DPI is a profile setting, not an INP field.
Curve geometry, audit resolution and comparison coordinates remain unchanged.

## Consequences

Mixed embedded and vector font banks remain searchable. Native font mode stays
opt-in and needs locally imported fonts. Tests cover mixed resources, ActualText,
rotated paths, explicit printer quantization and unchanged precise rotation.
Reference PDFs remain evaluation-only; no document-specific coordinates or
reference glyphs are inputs to rendering.
