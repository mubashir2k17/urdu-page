# Handoff — InPage `.inp` → PDF Converter

**Date:** 2026-08-31  
**Repo:** `/Users/mubashirsmacbook/projects/inpage-viewer`  
**Session focus:** v1 page setup, margin-aware layout, exact font measurement,
reference-harness coverage, functional font-provider selection, and portable
HarfBuzz shaping with direct searchable PDF glyph emission.

## State

- `npm test`: **53/53 passing** across 8 files.
- `npm run typecheck`: clean.
- `npm run audit:references`: completes and writes
  `tmp/pdfs/reference-audit/report.json`.
- `npm run audit:references -- --font fonts/NotoSansArabic-Regular.ttf`: also
  completes, verifying the injectable-font harness path.
- `npm run lint`: still fails before linting (exit 2) because ESLint 9 requires
  `eslint.config.js`; the repo only has legacy `.eslintrc.cjs`.
- `npm run build`: still fails across workspace packages because root path
  aliases pull sibling `src` files outside each package's configured `rootDir`.
  This is a pre-existing monorepo packaging problem, now also affecting the new
  layout workspace; root `npm run typecheck` remains clean.
- Git is initialized on the `main` branch. The disposable interface prototype
  remains isolated on `prototype/shaped-run-interface`.

## Completed

### Content extraction and harness

- Raw ASCII runs are preserved alongside `04 XX` Urdu content.
- v1 text is selected by dense `0x04` regions after the content delimiter;
  record payloads are not treated as the stream's outer framing.
- The public reference harness covers all four supplied INP/PDF pairs, mixed
  English, searchable output, source geometry, and renderer geometry.
- The harness accepts `--font /path/to/font.ttf` and reuses one conversion per
  fixture instead of rendering every document twice.

### Verified v1 page setup

`packages/inp-parser/src/page-setup.ts` now decodes the fixed six-field block in
`InPage100` beginning at stream offset `0x10E`:

| Tag | Meaning | Encoding |
|---|---|---|
| `06 01` | page width | `u32le / 2000` points |
| `07 01` | page height | `u32le / 2000` points |
| `08 01` | left margin | `u32le / 2000` points |
| `09 01` | top margin | `u32le / 2000` points |
| `0A 01` | right margin | `u32le / 2000` points |
| `0B 01` | bottom margin | `u32le / 2000` points |

The decoder requires the exact fixed offset, all six tags, and plausible values.
It runs only for v1; v2/v3 geometry remains unverified.

`PageSetup` exposes width, height, margins, source offset, and confidence through
both `openInPage()` and `inspectInPage()`. With `preservePageSize: true`, the PDF
renderer now uses decoded source width/height and margins.

### Margin-aware layout

- Added `@inpage/layout-engine`. Its small `resolvePageBox(pageSetup?)`
  interface returns page dimensions and a validated content rectangle.
- The renderer flows within decoded top/right/bottom/width limits instead of a
  fixed 50-point inset.
- The renderer shapes candidate lines once and uses the same `ShapedRun` for
  wrapping, right alignment, and PDF emission.
- `RenderPdfResult.pageCount` now reports every emitted overflow page rather
  than only the source page groups.
- Public PDF tests inspect emitted text matrices for the verified 54-point top
  margin and exact right alignment.

ADR-006 records the layout decision and its measured tradeoffs.

### Important fixture finding

`SAMPLE2.INP` encodes A4, byte-for-byte matching `FONTS.INP`'s setup. Its paired
PDF uses A3 media while keeping content in the upper-left A4-sized area. Treat
this as a source-setup versus print/export-media distinction, not a decoder
failure. No print-media field has been identified.

Details, offsets, fixture hashes, and primary-source limits are in
`docs/research/inpage-page-geometry.md`. ADR-005 records the implemented decision
and supersedes ADR-004.

## Current audit baseline

| Reference | Generated/reference pages | First-page size | Sampled ink overlap |
|---|---:|---:|---:|
| Font catalogue | 5 / 2 | Match (A4) | 1.8% |
| A3 sample | 3 / 1 | Intentional mismatch: source A4, PDF media A3 | 1.1% |
| Book body | 281 / 241 | Match (Letter) | 8.5% |
| Book table of contents | 15 / 12 | Match (Letter) | 1.3% |

Source dimensions and margins are now applied for the verified v1 family. The
book's page-count error narrows (184 vs 241 before margin layout; 281 vs 241
now) while overlap rises from 4.3% to 8.5%. Remaining pagination error is
dominated by fixed font size, missing decoded styles, frame/column layout, and
fallback-font width differences.

## Font-provider and shaping findings

- Registered `FontProvider` instances are now used when no explicit fallback is
  passed. Exact decoded font-name matches win; the newest provider supplies the
  fallback otherwise. Registration returns an unregister function.
- Raster verification confirms that the previous fontkit/Noto Sans path
  performed basic Arabic joining; older claims of fully disconnected glyphs
  were inaccurate.
- Official Noto Nastaliq Urdu was tested from the Noto project's
  [regular TTF](https://notofonts.github.io/nastaliq/fonts/NotoNastaliqUrdu/full/ttf/NotoNastaliqUrdu-Regular.ttf).
  Version 4.000
  (`sha256 e90e212403846e42c0160a9e9d8b5b5e4d3e42bdb5b6fdb588fd783a9107da40`)
  exhausted Node's 4 GB heap over the book corpus. The archived Noto Fonts
  [static build](https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoNastaliqUrdu/NotoNastaliqUrdu-Regular.ttf),
  version 3.003,
  (`sha256 2fd7b78ce48768b4d7b251457191e0f6db4c85e966a8a10a1f04e196dad35bb6`)
  crashed on a null GPOS anchor. Those failures apply to fontkit shaping, not
  full font embedding.
- HarfBuzz shapes both builds successfully. The production shaper uses
  HarfBuzz/WASM rather than the host's machine-specific `hb-shape` executable.
- Noto Nastaliq Urdu 4.000 is now vendored as the CLI and reference-harness
  default. pdf-lib/fontkit embeds it in full but never shapes or measures text.

## Portable HarfBuzz module

- Added `@inpage/text-shaper` with one deep interface:
  `TextShaper.shape(input): ShapedRun`.
- `ShapeInput` requires logical text, stable font identity/bytes, explicit
  direction, language, and script. `ShapedRun` returns positioned glyph ids,
  clusters, font units, total advance, missing-glyph count, and the unchanged
  logical text.
- The HarfBuzz adapter caches fonts by byte-array identity and reuses its buffer.
- Official Noto Nastaliq Urdu 4.000 shaped the full 347,446-character book under
  a 512 MB heap cap in 1.25 seconds: 596,570 glyphs, 57 MB peak JS heap, 171 MB
  peak RSS. This replaces fontkit's previous 4 GB failure for shaping and
  measurement.
- The corpus reported 549 missing glyphs. Font fallback/run segmentation must
  resolve those before emission.
- The disposable data-shape prototype is preserved on branch
  `prototype/shaped-run-interface` at commit `13ff0a7`; it is intentionally not
  present on `main`.
- ADR-008 records the interface and dependency decision.

## Shaped-glyph PDF emission

- `PdfBackend` now consumes `ShapedRun` instead of logical strings.
- The renderer shapes each candidate line, caches the run, and uses its total
  advance for both wrapping and right alignment.
- The pdf-lib backend embeds the full font as an Identity-H Type0 font, writes
  HarfBuzz glyph ids directly as CIDs, and applies each advance/offset with an
  explicit text matrix. It never calls `PDFFont.drawText()`, `encodeText()`, or
  `widthOfTextAtSize()`.
- The backend validates that each `ShapedRun.fontId` matches the embedded font,
  preventing glyph ids from being interpreted against the wrong font program.
- Each line is wrapped in marked content with UTF-16 `ActualText`, preserving the
  logical Unicode independently of contextual glyph cmap entries.
- A one-line Noto Nastaliq prototype rendered connected forms and passed Poppler
  extraction. The full book now renders to a 5.6 MB, 281-page PDF without the
  previous 4 GB shaping failure.
- ADR-009 records the PDF encoding and accessibility decision.

## Measured typography evidence

Reference-PDF inspection overturned the tempting page-count-only calibration:

- Book page 2 uses an effective font size of approximately **14.37 pt** after
  its PDF transform.
- Consecutive reference baselines are approximately **22.56 pt** apart, giving
  a leading factor near **1.57**. The renderer's current `1.6` is already close.
- With Noto Sans Arabic, changing the renderer from `1.6` to `1.3` happened to
  produce 241 pages, but this compensates for the wrong face/widths and is not
  evidence that the source leading is `1.3`.
- Removing paragraph gap reduced the generated book from 292 to 260 pages;
  reducing the font to 11 pt produced 252 pages. These are sensitivity probes,
  not decoded source values.
- `fixtures/inp/Final-1.inp` and `tests/book part1.inp` are byte-identical, so
  the smaller fixture is not an independent style-controlled comparison.

The shared v1 default-style bytes include plausible fixed-point values such as
`24000`, `2000`, `4000`, and `8000`; `24000 / 2000 = 12 pt` is a hypothesis,
not a verified field interpretation. All supplied fixtures share the same
default-style pattern, so local data does not provide the controlled variance
needed to assign those fields safely.

## Next task

Resolve missing glyphs and mixed-script runs before decoding typography:

1. Surface `missingGlyphCount` from line shaping as a renderer diagnostic. Do
   not silently emit glyph zero.
2. Segment Urdu, Latin, digits, and unsupported clusters into directional runs;
   preserve logical cluster boundaries when choosing fallback fonts.
3. Extend the backend from one validated font identity to multiple embedded font
   resources so one line can safely contain fallback runs.
4. Resolve decoded InPage font names through `FontProvider` per run, then select
   a licensed Latin/symbol fallback for clusters absent from Noto Nastaliq.
5. Add mixed Urdu/English/digit extraction and raster tests before enabling the
   fallback path for all fixtures.
6. Then decode per-run style/font ids and assign font size, weight, leading, and
   paragraph spacing only where controlled evidence verifies offsets and units.

After shaped runs and styles, investigate frames/columns. Do not infer their
coordinates from repeated setup-like byte blocks; no source currently verifies
those semantics, and the external MIT-format project leaves page group `0x03`
unknown.

## Key files

- `packages/inp-parser/src/page-setup.ts` — fixed v1 page-setup decoder
- `packages/document-model/src/index.ts` — public `PageSetup` model
- `packages/layout-engine/src/index.ts` — page/content-box seam
- `packages/text-shaper/src/index.ts` — `ShapedRun` interface and HarfBuzz/WASM
  adapter
- `packages/text-shaper/src/index.test.ts` — glyph, cluster, advance, and missing
  glyph contract tests
- `packages/pdf-renderer/src/render.ts` — margin-aware flow and overflow count
- `packages/pdf-renderer/src/pdflib-backend.ts` — identity-CID glyph emission
  and logical `ActualText`
- `packages/pdf-renderer/src/font-provider.ts` — provider priority, exact-name
  resolution, fallback, and scoped unregister
- `packages/pdf-renderer/src/font-provider.test.ts` — provider selection tests
- `tests/reference-harness.test.ts` — public geometry and conversion coverage
- `tools/audit-references.ts` — Poppler-backed structural/raster audit
- `docs/research/inpage-page-geometry.md` — primary evidence and unknowns
- `docs/adr/0005-v1-stream-boundaries-and-page-setup.md` — current decision
- `docs/adr/0006-margin-aware-layout.md` — layout decision and tradeoffs
- `docs/adr/0007-font-provider-selection-and-shaping-boundary.md` — provider
  selection and safe shaping boundary
- `docs/adr/0008-portable-text-shaping-module.md` — portable shaped-run module
  and corpus evidence
- `docs/adr/0009-shaped-glyph-pdf-emission.md` — raw glyph placement and
  searchable-text decision
- `COMPATIBILITY.md` — current feature matrix and audit baseline

## Cautions

- The four paired fixtures under `tests/` are the only local visual ground truth.
- No v2 or v3 fixture exists; do not claim geometry compatibility for them.
- Orientation can be derived from dimensions, but no stored orientation flag or
  paper enum has been verified.
- `PPicts*` images are retained but not decoded/rendered.
- Portable Noto Nastaliq shaping and PDF emission work for one font; mixed-script
  segmentation and fallback remain unresolved.
- Do not send `ShapedRun` back through `PDFFont.drawText()`; that would reshape
  the logical string and discard the verified glyph positions.
- Do not change leading to `1.3` merely because that matches the reference page
  count with Noto Sans; reference PDF baselines support approximately `1.57`.
- `--font` runs execute the candidate in the audit process. An incompatible
  complex font can crash or exhaust that process; isolate new candidates during
  compatibility testing.
- Font subsetting remains disabled. Full embedding is safe because fontkit is
  not asked to shape, measure, or encode the HarfBuzz glyph stream.
