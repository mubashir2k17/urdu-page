# Handoff — InPage `.inp` → PDF Converter

**Prepared:** 2026-09-11

**Repository:** `/Users/mubashirsmacbook/projects/inpage-viewer`

**Branch:** `main`

**Previous committed milestone:** `7d1f278 fix(render): restore Arabic kashida layout`

**This checkpoint:** vector font banks, printer glyph origins, native digits and pair kerning

**Last full verification:** 2026-09-11

## Objective

Convert legacy InPage documents into searchable PDFs while preserving page
geometry, Nastaliq shaping, positioned frames, columns, images, and mixed-script
content. The immediate quality target is visually faithful reconstruction of
`tests/SAMPLE2.INP` against `tests/SAMPLE2.pdf` without special-casing object
coordinates in the renderer.

## Current status

### 2026-09-11: SAMPLE2 fidelity goal remains active

- Target: at least **90%** in the unchanged 36 dpi grayscale ink-overlap audit.
  Latest fresh result: **82.0%**, one matching A3 sheet. **Not complete.**
- Continue the requested order (rotation, fonts, effects, tables) and the 80/20
  approach. First passes cover all four; prioritize missing visible content.
- Source line/frame caches now supply baselines, run extents, frame insets and
  column widths. Validated nested cell records restore the two-column poem.
  The large heading stays on one line; table rows use saved native placement.
- Negative and zero-width tracked runs retain their visible glyphs. Punctuation
  no longer forces whole Urdu words onto Noto, and joining hamza terminals work.
  Arabic and Noori word-space fitting preserves glyph advances where the saved extent
  allows it. Latin runs retain letter spacing. This fitting is still approximate.
- Corrected advancing Arabic Alef codes C8–CA, added native lam–alef forms,
  recovered paragraph-before/after spacing, and extended Noori punctuation.
  Local profile enables 18065 mappings, including 1431 overlays, in 89 banks.
- Border strokes are inside source bounds. Image placement uses saved scale and
  offsets from the inner border. Styles 15/17 approximate diamond and diagonal
  border patterns. Optional Wine Symbol handles the native callout arrows.
- Restored prefix-05 Sindhi using the supplied ZoharSindhi fonts and recovered
  contextual slots. Mixed paragraphs retain their switch back to Urdu.
- Pattern 3 uses a PDF tiling brush. Flattened hatch paths caused different
  rasterizer cell rounding; restoring tiling raised the audit from 74.1% to 76.0%.
- Recovered separate Latin character/space adjustments in the cache. Preserving
  explicitly tracked boundary spaces raises vertical caption overlap to 88.1%.
- Corrected Noori first/repeated-space handling. Outline text uses registered
  font vector paths, round joins/caps, and a 0.72 pt stroke, retaining ActualText.
- Restored native kashida counts and weighted placement. Arabic body now has all
  404 reference glyphs; its diagnostic overlap rose from 48.9% to 82.5%.
  Native mark classes select offsets calibrated from each supplied font.
- Verification: full suite **101/101**, root typecheck, fresh audit and visual
  inspection. Local font mode remains opt-in; reference PDFs are evaluation-only.
- Noori banks with OS/2 noEmbedding use filled paths and searchable standard-font
  placeholders. The native profile optionally places text on a 600 dpi printer grid.
- Numeric sequences use Noori digit glyphs. Recovered the native 200-unit
  tightening of bank 82 slots 71/72 after Alef; column extents improve.
- Largest remaining gaps: Pashto prefix 07 still needs its Noori Character table;
  Arabic marks and contextual spacing; remaining Noori metric differences;
  remaining border artwork. Line-height rounding alone was tested and rejected.
  The embedded Pashto table is now located, but its shaper remains unfinished.
- Source evidence and next investigation: `docs/research/sample2-layout-recovery.md`.
  Earlier sections below are historical milestones, not current limitations.


### Continuation: source widths and overlay glyphs

- Initial font-recovery milestone committed as `e9c4ef4`.
- Traced the original advance calculation at `0x409060`: it uses the DAT width
  plus a 65-unit default spacing, divided by the bank's metric denominator.
- Enabled 1,422 two-component mappings after verifying that the second
  component has zero advance and is drawn at the same origin. The current
  adapter supports **17,567 mappings across 89 banks**.
- Sample 2 has 83 distinct matching tokens (previously 73). Its experimental
  overlap is **14.2%**, up from 14.1%; unchanged Noto default remains 14.3%.
  It remains one A3 page. Original-font mode stays opt-in.
- The regenerated font comparison includes visually checked dot/body assembly
  for با, بت, and بٹ. Missing slots continue to fall back.
- Validation: **70/70 tests**, root typecheck, and focused reference audit.
  Three tests use imported local assets and skip without them.
- Root character alternatives, contextual joining, inter-ligature kerning,
  source run styles, and frame fills are still unresolved. See the continuation
  section in `docs/research/inpage-font-banks.md` for exact static evidence.

### Initial 2026-09-07 font recovery baseline

- Statically inspected the user-supplied Windows InPage installation; Wine was
  unnecessary for this pass. The folder label is not a verified app version.
- Copied 184 font files and `INPAGEU.DAT` to ignored `fonts/inpage-local/`, with
  a per-file hash inventory. All 100 `.UTF` files are TrueType fonts.
- Recovered a 22,574-node ligature tree with 17,989 terminal mappings. The
  experimental adapter enables 16,145 plain-letter, single-glyph mappings
  across 88 Noori banks. Unavailable slots and unsupported words use Noto.
- Added optional glyph font identities, PDF resource switching, and the fourth
  `RenderTypography` argument to renderer/converter `renderPdf`.
- `npm run fonts:import -- "/path/to/Inpage 2018"` reproduces local import.
  `npm run fonts:preview` creates a visually checked comparison specimen.
- `npm run audit:references -- --case sample --inpage-fonts fonts/inpage-local`
  uses copied fonts and writes `tmp/pdfs/inpage-font-audit/`. Sample 2 remains
  one A3 page, with **14.1%** ink overlap versus **14.3%** unchanged default.
  Keep this opt-in; source size/spacing and multi-component positioning remain
  unresolved. Original glyph usage alone has not improved whole-page fidelity.
- Validation: **67/67 tests**, root typecheck; includes two local-asset tests
  that skip when no installation has been imported.
- Evidence and next steps: `docs/research/inpage-font-banks.md` and ADR-011.

### Previous rendering baseline

- `npm test`: **55/55 passing** across 8 test files at the last full run.
- `npm run typecheck`: clean at the last full run.
- Git is initialized on `main`; the current code milestone is committed at
  `eb2a920`.
- The Poppler-backed reference harness covers four local INP/PDF pairs and can
  filter runs with `--case` or inject a candidate font with `--font`.
- Sample 2 renders as **one A3 page** at **841.92 × 1190.52 points**. It was
  previously reflowed across three A4 pages.
- Sample 2 sampled ink overlap is **14.3%**, up from **1.1%**. Its structure is
  substantially closer, but it is not yet pixel-faithful.
- The focused audit writes the current sample to
  `tmp/pdfs/reference-audit/sample2-current.pdf`. `tmp/` is ignored, so this
  artifact must be regenerated on a fresh checkout.

## Implemented system

### Container and text parsing

- Defensive OLE2/CFB parsing with sector and cycle validation.
- InPage version detection from `InPage100`, `InPage200`, or `InPage300`.
- Fixture-backed v1 legacy text decoding, including composites, Urdu codes,
  embedded ASCII, paragraphs, and dense text-region detection.
- Preserved story blocks in `InPageDocument.stories`; the flattened
  `paragraphs` view remains for compatibility.

### Geometry and page objects

- Verified v1 page width, height, and margins from the fixed page-setup block.
- Verified self-sized drawing-object records with top-left bounds encoded in
  1/2000-point units.
- `PageObject` exposes text, image, line, graphic, guide, and page records plus
  known story references, image names, column counts, rotation, and a limited
  border signal.
- Sample 2 story frames, its three-column frame, annotation objects, and logo
  frame are decoded from source records rather than hard-coded positions.

### Typography and PDF output

- Portable HarfBuzz/WASM shaping through the `TextShaper.shape()` →
  `ShapedRun` boundary.
- Noto Nastaliq Urdu 4.000 is the vendored default font.
- The PDF backend embeds the font fully and emits positioned glyph IDs without
  asking fontkit to reshape or measure text.
- Logical Unicode is preserved with `ActualText`, so generated text remains
  searchable despite contextual glyph IDs.
- Source-frame rendering is opt-in with `preserveLayout`; physical output media
  can be selected independently with `outputPageSize`.
- Positioned mode supports frame fitting, multiple columns, rotated text,
  basic word-direction segmentation, linked DIB images, borders, rules, and
  reconstructed callout arrows.
- Headerless, uncompressed indexed, 24-bit, and 32-bit Windows DIB streams can
  be converted to PNG at the PDF-backend boundary.

## Reference baseline

| Reference | Generated/reference pages | First-page size | Sampled ink overlap |
|---|---:|---:|---:|
| Font catalogue | 5 / 2 | Match (A4) | 1.8% |
| A3 Sample 2 | 1 / 1 | Match (A3 output; A4 source composition) | 14.3% |
| Book body | 281 / 241 | Match (Letter) | 8.5% |
| Book table of contents | 15 / 12 | Match (Letter) | 1.3% |

These percentages are diagnostic baselines, not accepted quality thresholds.
Sample 2 uses A4 source setup but was exported on an A3 sheet with the source
composition anchored at the upper-left. Do not overwrite source setup to make
it appear that the INP file stores A3 media.

## Historical gaps at the original geometry milestone

1. Frame fills, pattern brushes, stroke styles, and polygon/slanted boundaries
   are not decoded. The heading band, black feature box, poem frame, and table
   therefore differ visibly from the reference.
2. Source paragraph/run styles are not connected to rendered text. Positioned
   layout fits one fallback font heuristically within each frame.
3. Mixed-direction handling is word-based, not a complete cluster-safe Unicode
   bidi implementation. Tabular Latin text, numbers, punctuation, and Urdu can
   still be ordered or aligned incorrectly.
4. The PDF backend now supports explicit per-glyph font identities for the
   experimental local Noori adapter. General per-run Latin/symbol fallback
   remains absent; 549 missing glyphs were measured over the default book corpus.
5. Table/tab-stop structure and cell alignment are not decoded.
6. Positioned reconstruction is only enabled for Sample 2 in the reference
   manifest. Multi-page frame ownership and text threading remain unverified.
7. No v2 or v3 fixture exists, so geometry compatibility is only claimed for
   the verified v1 family.
8. `npm run lint` is blocked by the ESLint 9/legacy `.eslintrc.cjs` mismatch.
9. Workspace builds are blocked by package `rootDir` settings interacting with
   root TypeScript path aliases. Root typecheck is the current reliable gate.

## Earlier implementation goals

### P0 — Decode Sample 2 visual frame styling

Recover fill, pattern, stroke, and shape fields for the known source objects.
Start with the black feature box, patterned heading band, slanted poem frame,
and table header/rules.

Acceptance criteria:

- No object-ID or fixture-name branching in production rendering code.
- Parser tests identify each implemented property from bounded source records.
- Renderer tests cover fill/stroke output through the public render API.
- Sample 2 remains one A3 page and exceeds the 14.3% raster baseline; use 20%
  as the first incremental target.

### P1 — Decode story and paragraph typography

Link story/run style references to face, size, color, leading, alignment, and
outline attributes. Replace fit-to-frame sizing wherever source values are
verified.

Acceptance criteria:

- Every decoded field has controlled fixture evidence, offset bounds, units,
  confidence, and a malformed-input test.
- Heading, label, body, poetry, footer, and rotated-text sizes are visibly
  distinct for source-derived reasons.
- Existing flow-mode pagination does not regress without measured evidence.

### P2 — Add cluster-safe bidi and multi-font fallback

Segment Urdu, Arabic, Latin, numbers, punctuation, and unsupported clusters
without breaking HarfBuzz cluster boundaries. Extend the backend to validate
and select more than one embedded font resource.

Acceptance criteria:

- Missing glyphs become explicit renderer diagnostics rather than silent glyph
  zero output.
- Mixed Urdu/English/numeric table tests verify visual ordering and searchable
  logical text.
- Font fallback selection is deterministic and uses licensed, vendored fonts.

### P3 — Decode tables, tabs, and multi-page frame ownership

Recover tab stops, cell widths/alignment, story threading, page association,
and overflow behavior. Only then enable positioned mode for the long book and
table-of-contents references.

Acceptance criteria:

- Sample 2 table cells align with the reference.
- Frame objects are assigned to the correct source page without relying on
  record order alone.
- Book and table-of-contents page counts do not regress when positioned mode is
  enabled.

### P4 — Repair repository quality gates

- Migrate lint configuration to ESLint 9 flat config.
- Fix workspace TypeScript build boundaries without weakening strictness.
- Add CI gates for tests, root typecheck, focused Sample 2 audit, and package
  builds once repaired.

## Original next-task plan (historical)

Begin with P0 and use the paired Sample 2 files as controlled evidence:

1. Dump the complete payload and property ordering for graphic objects 34/35
   and the objects corresponding to the black box, table, and poem.
2. Compare one differing property at a time against the rasterized reference.
3. Add a failing parser assertion for the smallest verified style property.
4. Implement that property in the document model and parser.
5. Add a failing PDF operator/raster assertion, implement backend rendering,
   and rerun the focused audit.
6. Record the new overlap and update this handoff only after verification.

Avoid guessing style tags from a single object. Use multiple objects with known
visual differences to rule out unrelated flags.

## Commands

```bash
npm test
npm run typecheck
npm run audit:references -- --case sample
npm run audit:references
npm run audit:references -- --font /absolute/path/to/font.ttf --case sample
```

The focused audit writes its report to
`tmp/pdfs/reference-audit/report.json` and the generated PDF to
`tmp/pdfs/reference-audit/sample2-current.pdf`.

## Key files

- `packages/document-model/src/index.ts` — public document and render types
- `packages/inp-parser/src/page-setup.ts` — verified v1 page setup
- `packages/inp-parser/src/page-objects.ts` — positioned object decoding
- `packages/inp-parser/src/stories.ts` — preserved story decoding
- `packages/inp-parser/src/legacy-decode.ts` — v1/v2 character decoding
- `packages/text-shaper/src/index.ts` — HarfBuzz shaping boundary
- `packages/pdf-renderer/src/render.ts` — flow/positioned mode selection
- `packages/pdf-renderer/src/positioned-layout.ts` — frame composition
- `packages/pdf-renderer/src/pdflib-backend.ts` — PDF glyph/image primitives
- `packages/pdf-renderer/src/dib-to-png.ts` — raw DIB conversion
- `tests/reference-manifest.ts` — per-reference expectations and mode selection
- `tests/reference-harness.ts` — public conversion audit
- `tools/audit-references.ts` — Poppler raster/text comparison
- `COMPATIBILITY.md` — supported-feature matrix and audit baseline

## Decisions and evidence

- `docs/adr/0005-v1-stream-boundaries-and-page-setup.md`
- `docs/adr/0006-margin-aware-layout.md`
- `docs/adr/0007-font-provider-selection-and-shaping-boundary.md`
- `docs/adr/0008-portable-text-shaping-module.md`
- `docs/adr/0009-shaped-glyph-pdf-emission.md`
- `docs/adr/0010-source-frame-pdf-reconstruction.md`
- `docs/research/inpage-page-geometry.md`

## Guardrails

- Treat the four paired PDFs as the only local visual ground truth.
- Do not claim v2/v3 geometry support without fixtures.
- Do not pass logical strings through `PDFFont.drawText()`; that discards the
  verified HarfBuzz glyph sequence and reintroduces complex-font failures.
- Keep font subsetting disabled until its fontkit GPOS failure has a verified
  fix.
- Do not tune leading or font size merely to hit a reference page count; use
  decoded source evidence and baseline geometry.
- Keep source page setup distinct from print/export media.
- Isolate candidate-font audits because incompatible complex fonts can crash or
  exhaust the audit process.
