# SAMPLE2 reference comparison

**Update, 2026-09-08:** the latest implementation reaches **38.5%** on the same
audit. See [layout recovery](sample2-layout-recovery.md) for changes, validation
and remaining work. The comparison below records the earlier 14.2% baseline;
its images and interactive artifact have not been regenerated for the new pass.

Date: 2026-09-07. Compared `tests/SAMPLE2.pdf` with fresh conversions of
`tests/SAMPLE2.INP`, using both the Noto baseline and the recovered InPage font
adapter. This records the working-tree implementation after commit `e9c4ef4`,
including the subsequent DAT advance and overlay changes.

## Result

The page boundary and broad frame placement agree, but the generated page is
still visually far from the reference. Recovered fonts change individual word
shapes and wrapping without improving whole-page ink overlap in this sample.
They do not yet reproduce the reference's mixture of fonts and text effects.

| Check | Reference PDF | Noto render | Recovered InPage fonts + fallback |
| --- | --- | --- | --- |
| Pages | 1 | 1 | 1 |
| Page size, points | 841.92004 × 1190.52002 | 841.92 × 1190.52 | 841.92 × 1190.52 |
| Ink overlap with reference, 36 dpi | — | 14.27% | 14.20% |
| PDF-extracted non-whitespace characters | 2,138 | 3,455 | 3,227 |

The audit explicitly selects an A3 output sheet to match the reference. The INP
page setup is A4; matching the exported sheet size does not demonstrate that the
source stores A3. The composition occupies the upper-left part of the A3 sheet.

Ink overlap is the sum of the minimum pixel ink divided by the sum of the
maximum pixel ink, using grayscale rasters at the same physical coordinates.
There is no alignment correction. It is sensitive to shifts, wrapping, fills,
and font outlines; **it is not a percentage of overall rendering correctness**.
The 0.07 percentage-point decrease is too small to support a general conclusion
about font quality.

PDF text extraction also depends on encoding and reading order. These character
counts do not establish which version has correct or complete content. The INP
parser extracts 3,932 characters including whitespace and reports no diagnostics;
that count uses a different definition from the PDF counts.

## Visual observations

| Region | Reference | Current render with recovered fonts |
| --- | --- | --- |
| Top poem and logo | Slanted black poem box; shaped logo clipping | Rectangular overlapping outlines, missing black treatment; rectangular logo |
| Large heading | Patterned lettering and heavy decorative border | Pattern and border absent; different lettering and word spacing |
| Arabic paragraphs | Naskh typography with compact lines | Nastaliq-like typography, substantially different wrapping |
| Central heading and feature box | Positioned heading; white Urdu on black | Displaced words; black fill and white-letter treatment absent |
| Table | Gray header, separately aligned city and numeric columns | Header fill absent; headers and values run together or occupy incorrect positions |
| Three-column body | Three aligned columns with consistent paragraph flow | Column structure approximately retained, but line breaks and text heights differ |
| Lower poetry | Two distinct poetry columns | Text collects toward the right instead of preserving the two-column arrangement |
| Decorative lower lettering | Outlined/rotated lettering and several font treatments | Solid lettering, different orientation and mostly normalized styles |
| Side annotations | Bold sans-serif labels and heavy arrows | Smaller serif labels, thin arrows, and stray text near the lower annotations |
| Right-side contact text | Vertical URL/email alongside the composition | Horizontal text near the bottom extends to the right edge of the sheet |

Both renderer variants share the major layout and decoration failures. For
example, recovered fonts reduce the top poem from the baseline's three lines to
two, but the slanted black box is still missing.

## Next investigation priorities

1. Trace the stored text transform and frame transform for the right-side contact
   text and the lower rotated heading. Use their reference positions to distinguish
   missing transform decoding from missing application during rendering.
2. Recover table cell boundaries, alignment, and text placement independently of
   font shaping; the present geometry does not reproduce the visible table.
3. Trace per-run font/style selection for the Naskh paragraphs, English labels,
   and varied lower specimens. Whole-word Noori coverage alone cannot reproduce
   those font families.
4. Recover fills, outlines, clipping, and decorative borders, especially the black
   feature box and patterned heading.
5. Reassess advances, line breaks, and poetry flow after the corresponding font
   and frame properties are represented.

These are investigation priorities based on visible symptoms, not proven binary
field interpretations.

## Reproduction and local artifacts

Run from the repository root with the locally imported font banks available:

```sh
npm run audit:references -- --case sample
npm run audit:references -- --case sample --inpage-fonts fonts/inpage-local
```

- Reference: `tests/SAMPLE2.pdf`.
- Source: `tests/SAMPLE2.INP`.
- Noto PDF and metrics: `tmp/pdfs/reference-audit/sample2-current.pdf` and
  `tmp/pdfs/reference-audit/report.json`.
- InPage-font PDF and metrics: `tmp/pdfs/inpage-font-audit/sample2-current.pdf` and
  `tmp/pdfs/inpage-font-audit/report.json`.
- Visual inspection rasters: `tmp/pdfs/sample2-comparison/{reference,noto,inpage}.png`,
  generated with Poppler at 100 dpi (1,170 × 1,654 pixels).

The temporary outputs are ignored by Git. Compact palette copies are used only
for the conversation comparison; the reported overlap comes from the audit's
unmodified grayscale rasters.
