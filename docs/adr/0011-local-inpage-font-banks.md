# ADR-011: Local InPage font banks

- **Status**: Accepted (experimental, opt-in)
- **Date**: 2026-09-07
- **Builds on**: ADR-008, ADR-009, ADR-010

## Context

The supplied Windows installation contains symbol-encoded font banks and a
separate ligature lookup tree. The fonts cannot shape logical Unicode with
HarfBuzz. Static analysis recovered sequence-to-bank/slot mappings, but source
spacing and multi-component glyph positioning remain incomplete.

## Decision

Keep the existing Noto default. Import original assets into an ignored local
directory with a hash inventory and pin DAT loading to the inspected file's
SHA-256. Decode bounded trie records in `text-shaper`; perform filesystem and
fontkit integration in explicit development tools.

Use only unambiguous whole-word, single-glyph matches with valid copied glyphs.
Preserve HarfBuzz for all unmatched words. Add optional `ShapedGlyph.fontId`
overrides, with all metrics expressed in the containing run's units. The PDF
backend registers distinct font resources and checks every override before
emission. Preserve the logical run in `ActualText` across font switches.

Expose an optional fourth `RenderTypography` argument on renderer/converter
`renderPdf`, containing a `TextShaper` and additional `ShapeFont` entries.
The audit's `--inpage-fonts` flag opts into this path and writes a separate
report directory, keeping default baselines intact.

## Verification

Synthetic tests cover bounded decoding, input immutability including Node
Buffers, malformed profiles/references, shaping fallback, scalar clusters,
metric normalization, ambiguous mappings, PDF resource switching across pages,
unknown font identities, and public API integration. Optional local tests
verify the supplied DAT and both an available and missing font slot.

The suite passes 67 tests with local assets installed. Root typecheck passes.
Twelve recovered word glyphs were visually checked in the comparison PDF.
Sample 2 remains one A3 page, with 14.1% experimental overlap versus 14.3%
default. See `docs/research/inpage-font-banks.md` for provenance and offsets.

## Consequences

Original font glyphs can now be used without corrupting their Unicode text.
The path is intentionally experimental because whole-page fidelity has not
improved, source styles are unconnected, and the data references some slots
missing from the supplied fonts. Full embedding of many banks makes PDFs
larger. Copied assets and generated font specimens remain local.

## Extension: source widths and two-component overlays

Further static tracing verifies the width calculation and same-origin placement
of zero-advance second components. The adapter now accepts these pairs and uses
DAT widths plus the executable's observed 65-unit default spacing, normalized
by each bank's metric denominator. It does not infer contextual kerning.

`LegacyLigatureGlyph.overlay` optionally carries the second font/glyph identity.
Both output glyphs retain one logical cluster and origin; the combined advance
is applied once after the second glyph. Width readers reject invalid references
and nonzero widths with zero denominators, while allowing zero-width banks.

This expands support to 17,567 mappings across 89 banks, including 1,422
overlays. Validation passes 70 tests and typecheck; the refreshed specimen
visually confirms three dot/body assemblies. Sample 2 scores 14.2% versus the
14.3% unchanged default, so this remains opt-in.

## Alternatives considered

Directly replacing Noto with a `.TTF` or `.UTF` bank was rejected: its symbol
cmap maps private slots, not Unicode Urdu. Guessing two-component placement or
adjusting nominal font sizes to improve a raster score was rejected pending
evidence from the metric tables or controlled exports.
