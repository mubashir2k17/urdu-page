# Handoff — InPage `.inp` → PDF Converter

**Date:** 2026-08-31  
**Repo:** `/Users/mubashirsmacbook/projects/inpage-viewer`  
**Session focus:** v1 page setup, margin-aware layout, exact font measurement,
reference-harness coverage, and functional font-provider selection.

## State

- `npm test`: **49/49 passing** across 7 files.
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
- Git is initialized on the `main` branch; this handoff is included in the
  initial repository snapshot.

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
- `PdfBackend.measureText()` uses the embedded font's exact widths for wrapping
  and right alignment; measurements are cached for the render.
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
| Font catalogue | 5 / 2 | Match (A4) | 0.8% |
| A3 sample | 3 / 1 | Intentional mismatch: source A4, PDF media A3 | 0.9% |
| Book body | 292 / 241 | Match (Letter) | 5.0% |
| Book table of contents | 15 / 12 | Match (Letter) | 0.8% |

Source dimensions and margins are now applied for the verified v1 family. The
book's page-count error narrows slightly (184 vs 241 before margin layout; 292
vs 241 now) while overlap rises from 4.3% to 5.0%. Remaining pagination error is
dominated by fixed font size, missing decoded styles, frame/column layout, and
fallback-font width differences.

## Font-provider and shaping findings

- Registered `FontProvider` instances are now used when no explicit fallback is
  passed. Exact decoded font-name matches win; the newest provider supplies the
  fallback otherwise. Registration returns an unregister function.
- Raster verification confirms that fontkit performs basic Arabic joining for
  the current Noto Sans fallback; older claims of fully disconnected glyphs
  were inaccurate.
- Official Noto Nastaliq Urdu was tested from the Noto project's
  [regular TTF](https://notofonts.github.io/nastaliq/fonts/NotoNastaliqUrdu/full/ttf/NotoNastaliqUrdu-Regular.ttf).
  Version 4.000
  (`sha256 e90e212403846e42c0160a9e9d8b5b5e4d3e42bdb5b6fdb588fd783a9107da40`)
  exhausted Node's 4 GB heap over the book corpus. The archived Noto Fonts
  [static build](https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoNastaliqUrdu/NotoNastaliqUrdu-Regular.ttf),
  version 3.003,
  (`sha256 2fd7b78ce48768b4d7b251457191e0f6db4c85e966a8a10a1f04e196dad35bb6`)
  crashed on a null GPOS anchor. Neither is safe to vendor as the default with
  the current backend. The downloaded candidates were removed after testing.
- HarfBuzz shapes both test strings successfully. A portable HarfBuzz-backed PDF
  path remains the correct boundary for faithful Nastaliq. The local host has
  `/opt/homebrew/bin/hb-shape`, but production code must not depend on that
  machine-specific executable.

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

Build a portable shaped-glyph boundary before changing typography constants:

1. Define a small renderer-facing `ShapedRun` interface containing glyph ids,
   advances, offsets, logical text, direction, and font identity. Keep it
   independent of pdf-lib and any one shaper.
2. Prototype a JavaScript/WASM HarfBuzz implementation with official Noto
   Nastaliq Urdu. Validate a short Urdu string, one fixture page, then the full
   book corpus under an explicit memory limit before adopting dependencies.
3. Prove how shaped glyphs will be embedded while preserving searchable logical
   text and ToUnicode mapping. Do not route shaped output back through fontkit in
   a way that reshapes it or recreates the current failure.
4. Once the shaping/measurement seam is stable, decode per-run style/font ids
   and only then assign font size, weight, leading, and paragraph spacing fields
   where controlled evidence verifies offsets and units.
5. Re-run page-count, PDF-text, and raster audits after each verified field.

After shaped runs and styles, investigate frames/columns. Do not infer their
coordinates from repeated setup-like byte blocks; no source currently verifies
those semantics, and the external MIT-format project leaves page group `0x03`
unknown.

## Key files

- `packages/inp-parser/src/page-setup.ts` — fixed v1 page-setup decoder
- `packages/document-model/src/index.ts` — public `PageSetup` model
- `packages/layout-engine/src/index.ts` — page/content-box seam
- `packages/pdf-renderer/src/render.ts` — margin-aware flow and overflow count
- `packages/pdf-renderer/src/pdflib-backend.ts` — cached embedded-font metrics
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
- `COMPATIBILITY.md` — current feature matrix and audit baseline

## Cautions

- The four paired fixtures under `tests/` are the only local visual ground truth.
- No v2 or v3 fixture exists; do not claim geometry compatibility for them.
- Orientation can be derived from dimensions, but no stored orientation flag or
  paper enum has been verified.
- `PPicts*` images are retained but not decoded/rendered.
- Basic Arabic joining works for Noto Sans; faithful Nastaliq remains blocked by
  the current fontkit backend.
- Do not change leading to `1.3` merely because that matches the reference page
  count with Noto Sans; reference PDF baselines support approximately `1.57`.
- `--font` runs execute the candidate in the audit process. An incompatible
  complex font can crash or exhaust that process; isolate new candidates during
  compatibility testing.
- Font subsetting remains disabled because fontkit crashes in complex Arabic
  GPOS processing; full embedding is the safe path.
