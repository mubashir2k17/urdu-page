# ADR-010: Source-frame PDF reconstruction

- **Status**: Accepted
- **Date**: 2026-08-31
- **Builds on**: ADR-006 and ADR-009

## Context

Paragraph reflow cannot reproduce DTP documents such as `SAMPLE2.INP`. The v1
content stream contains self-sized drawing-object records before its story
text. Inspection against the paired PDF verifies that object properties `00`
through `03`, stored in 1/2000-point units, are top-left x/y/width/height.
Text-frame payloads also carry story references, multi-column counts, and
rotation. `PPicts*` CFB streams include headerless Windows DIB images.

Flattening those structures produced three A4 pages with 1.1% sampled raster
overlap against the one-page A3 reference.

## Decision

- Preserve decoded v1 stories separately from the compatibility `paragraphs`
  view.
- Expose bounded `PageObject` records for text, image, line, graphic, guide,
  and page objects, with top-left point bounds and verified optional fields.
- Detect hexadecimal `PPicts*` stream suffixes and uncompressed headerless DIB
  metadata. Convert supported DIB depths to PNG only at the PDF-backend seam.
- Add opt-in `preserveLayout` and `outputPageSize` render options. The physical
  output sheet is separate from source page setup; objects remain anchored to
  the source top-left origin.
- Associate story references in numeric record order and render frames at
  source coordinates. Fit text within frames, honor three-column and rotated
  frames, segment word runs by direction, draw linked images, borders, rules,
  and callout arrows, and retain `ActualText` on shaped text.
- Keep paragraph reflow as the default until positioned reconstruction has
  wider fixture coverage.

## Verification

- Parser integration tests verify at least 29 Sample 2 stories, 30 positioned
  objects, the three-column frame, the 171×93-point logo frame, and its
  192×144 DIB source.
- PDF integration verifies one A3 page with an embedded image XObject.
- The focused reference audit reports one generated/reference page, matching
  841.92×1190.52-point media, and 14.3% sampled ink overlap.
- The full parser/PDF tests and root typecheck remain clean.

## Consequences

- Sample 2 now preserves the original one-page composition instead of flowing
  text across three pages, and mixed Latin/numeric words are no longer shaped
  as reversed RTL strings.
- The output is structurally faithful but not pixel-identical. Pattern fills,
  table cell styling, exact source fonts, per-run sizes, colors, and outline
  effects remain undecoded.
- Headerless DIB decoding is intentionally limited to uncompressed indexed,
  24-bit, and 32-bit data. Unsupported compression remains explicit.
- `outputPageSize` is a print/export choice. It must not overwrite decoded
  source setup or imply that the source stored A3 media.

## Alternatives considered

### Infer layout from paragraph order

Rejected because story order is not page reading order and cannot reconstruct
overlapping, rotated, framed, or multi-column objects.

### Hard-code Sample 2 coordinates

Rejected because the coordinates, story links, columns, rotation, and image
name are present in bounded source records and can be decoded generically.

### Treat the paired PDF media as source page setup

Rejected because Sample 2's verified source setup is A4. The A3 sheet belongs
to the export/print boundary.
