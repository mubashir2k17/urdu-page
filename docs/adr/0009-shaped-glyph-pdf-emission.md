# ADR-009: Shaped-glyph PDF emission

- **Status**: Accepted
- **Date**: 2026-08-31
- **Builds on**: ADR-008

## Context

`@inpage/text-shaper` produces verified HarfBuzz glyph ids, advances, offsets,
and logical Unicode. Passing the logical string to `PDFFont.drawText()` would
run fontkit layout again, discard those positions, and reintroduce the Noto
Nastaliq memory and GPOS failures that motivated ADR-008.

The PDF must use the shaped glyph sequence for display while keeping the source
Unicode searchable and accessible. Contextual Nastaliq glyphs also cannot rely
on a font cmap entry for text extraction.

## Decision

- Change `PdfBackend` to measure and draw `ShapedRun` values rather than strings.
- Require each run's font identity to match the font embedded by the backend.
- Shape candidate lines in the renderer and use the same run for wrapping,
  right alignment, and emission.
- Fully embed the selected TrueType font as a Type0 font using Identity-H and
  identity CID-to-glyph mapping.
- Encode each HarfBuzz glyph id as its two-byte CID. Position each glyph with an
  explicit text matrix derived from its pen position and HarfBuzz offsets.
- Wrap each logical line in marked content whose `ActualText` is the original
  UTF-16 string. Do not depend on contextual glyph cmap entries for extraction.
- Vendor Noto Nastaliq Urdu 4.000 as the CLI and reference-harness default.
- Keep subsetting disabled. pdf-lib/fontkit is used for full font embedding, not
  for shaping, measuring, or encoding the rendered text.

## Verification

- A one-line prototype rendered connected Nastaliq and exposed the logical Urdu
  through Poppler text extraction.
- The eight-file suite passes 53 tests, including assertions for `ActualText`,
  multiple raw glyph `Tj` operations, page geometry, and exact shaped alignment.
- The full 347,446-character book renders without the previous fontkit heap
  failure. Its generated PDF is 5.6 MB and 281 pages.
- The reference audit improves sampled book ink overlap from 5.0% to 8.5% and
  generated book pagination from 292 to 281 pages versus a 241-page reference.

## Consequences

- pdf-lib never reshapes positioned text. The backend owns low-level PDF
  operators, while HarfBuzz and layout policy remain outside it.
- Individual glyph matrices prioritize correct advances and mark offsets over
  compact content streams. A future optimization may coalesce safe glyphs into
  `TJ` arrays without changing the backend contract.
- Missing glyphs are still reported by the shaper, but the renderer does not yet
  segment runs or select fallback fonts. That is now the next correctness seam.
- Full embedding produces larger PDFs but avoids the unsafe complex-font subset
  path and preserves contextual glyph outlines.

## Alternatives considered

### Send logical Unicode through `PDFFont.drawText()`

Rejected because it invokes fontkit shaping and loses the verified HarfBuzz
positions.

### Depend only on the embedded font's ToUnicode cmap

Rejected because contextual and ligature glyph ids may not have a direct
Unicode cmap mapping. `ActualText` preserves the logical run independently.

### Emit one text string with built-in font widths

Rejected because the PDF widths do not express all HarfBuzz advances and
x/y offsets required for Nastaliq marks and contextual placement.
