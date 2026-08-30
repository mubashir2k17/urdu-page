# ADR-008: Portable text-shaping module

- **Status**: Accepted
- **Date**: 2026-08-31
- **Builds on**: ADR-007

## Context

The pdf-lib/fontkit path performs basic Arabic joining for Noto Sans Arabic, but
cannot safely process official Noto Nastaliq Urdu at book scale. Version 4.000
exhausted a 4 GB Node heap during fontkit measurement; an older static build
crashed on a null GPOS anchor.

Shaping and PDF emission are different responsibilities. Coupling them made it
impossible to evaluate a safer shaper without also redesigning PDF embedding.
The renderer needs positioned glyph ids and font-unit metrics while retaining
the original logical text for search and accessibility.

## Decision

- Add a separate `@inpage/text-shaper` workspace.
- Define one synchronous `TextShaper.shape(input): ShapedRun` interface.
- Require callers to provide an already-segmented run with explicit `ltr` or
  `rtl` direction, language, script, stable font identity, and font bytes.
- Return logical text, font identity, direction metadata, units per em,
  positioned glyph ids, source clusters, total advance, and missing-glyph count.
- Use `harfbuzzjs` 1.6.0 as the portable MIT-licensed HarfBuzz/WASM adapter.
- Cache HarfBuzz font objects by byte-array identity and reuse one buffer so
  book-scale shaping does not rely on garbage collection for every paragraph.
- Keep pdf-lib and layout policy out of the shaping module.

## Verification

The adapter matches system HarfBuzz glyph ids and advances for the checked Urdu
sample. With official Noto Nastaliq Urdu 4.000, the same adapter shaped:

- `FONTS.INP`: 1,102 characters / 1,889 glyphs in 10 ms;
- `Final-1.inp`: 347,446 characters / 596,570 glyphs in 1.25 seconds.

The full-book run used a 512 MB Node heap limit and peaked at 57 MB heap / 171 MB
RSS. It reported 549 missing glyphs, which must be resolved through font
fallback rather than silently emitted as glyph zero.

## Consequences

- Portable Nastaliq shaping is no longer the blocker. ADR-009 records the
  renderer's direct shaped-glyph embedding path.
- Mixed-script text must eventually be segmented and assigned fallback fonts
  before shaping. The explicit run metadata prevents the shaper from hiding
  that unresolved policy.
- Glyph metrics remain in font units and are scaled by layout/rendering code,
  avoiding premature point-size assumptions.

## Alternatives considered

### Invoke the host `hb-shape` executable

Rejected because it is not portable and would add process-spawn overhead and a
machine-level dependency.

### Upgrade or patch fontkit

Rejected as the primary path because current upstream releases retain the null
anchor and unbounded-memory failure modes for the tested Nastaliq fonts.

### Put HarfBuzz directly inside the PDF backend

Rejected because it would couple shaping, layout, font fallback, and PDF object
construction. The separate deep module keeps the renderer-facing interface
small and independently verifiable.
