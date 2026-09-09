# ADR-012: Validated saved line layout

- **Status**: Accepted (experimental positioned rendering)
- **Date**: 2026-09-09
- **Builds on**: ADR-010, ADR-011

## Context

Reflowing source-sized text still changed line breaks, column contents and
poetry cells. The inspected v1 file includes serialized frame and line geometry
whose byte coverage can be checked against its independent text/style tables.

## Decision

Expose optional `Story.cachedLayout`, with frame identity, content dimensions,
columns, line baselines and run extents. Accept complete tables only after
matching text-byte coverage and frame groups. Nested cells require matching
child coverage and geometry before expansion. Missing or invalid caches retain
the existing layout fallback. No fixture names, object IDs or reference PDF
coordinates are used as production selection rules.

Positioned rendering derives insets, line breaks, baseline shifts and column
gaps from the cache. It still shapes logical text through the font adapters.
Saved extents constrain approximate advance/word-space fitting; they are not
presented as recovered per-glyph positions. Negative advances can still contain
visible glyphs and must not be discarded.

## Consequences

The main heading, columns, tabular rows and nested poem preserve substantially
more source geometry. The source A4 composition remains distinct from A3 print
media. This adds optional model fields without changing flow rendering APIs.
The cache schema is verified for the supplied v1 profile only. Unsupported
script kinds and incomplete shaping remain visible limitations.

## Verification

Fixture tests cover exact coverage, nested cells and corrupt-table fallback.
Renderer tests cover visible negative/zero-width runs and Latin spacing.
The unchanged SAMPLE2 raster audit is the fidelity gate; its 90% target remains
active. Current results and binary evidence are in
`docs/research/sample2-layout-recovery.md`.
