# ADR-020: Sub-pixel spacing fidelity — micro-harness and stretch-zone fixes

- **Status**: Accepted — implemented 2026-11-12 (see Implementation notes; two
  hypotheses were falsified against the fixtures)
- **Date**: 2026-11-12
- **Builds on**: ADR-012, ADR-016, ADR-018, ADR-019

## Context

Generated PDFs look structurally correct at page scale but show minor spacing
drift on close inspection: words slightly loose/tight, inter-word gaps uneven,
line endpoints correct while interiors drift, rotated/tabular runs visibly off.

Current harness cannot see this class of defect:

- `tools/visual-diff.ts` renders at 36 dpi. One pixel ≈ 2 pt, so a 0.2–1.0 pt
  systematic shift changes almost no pixels. `resizeNearest` plus aggregate
  `inkOverlap` further hides sub-pixel drift.
- `tools/vector-diff.ts` compares Poppler `<use>` glyph boxes with
  `tolerance = 2` pt and greedy nearest-centre matching. A whole line shifted
  1.5 pt still "matches", and `meanCenterDelta` averages away systematic bias.
- `packages/pdf-renderer/src/styled-layout.ts` fits every saved line to its
  source `columnWidth` by uniform `ratio` scaling of all glyph `xAdvance`
  values. Endpoints match, interiors are distorted by construction.
- `measureShapedRun` integrates `totalAdvance` only, while `drawShapedRun`
  places each glyph with `xOffset`/`horizontalScale`/rotation and quantizes
  origins (`snapToDevice` floor to 0.12 pt, `glyphPositionDpi` floor,
  `paintedSize` rounding). Measure and draw therefore disagree at the
  0.1–0.5 pt level on every line.
- Token paths collapse whitespace: `positioned-layout.ts` splits on `/\s+/`,
  re-joins paragraphs with a single `" "`, and shapes `" "` always as LTR.
  Multiple spaces, tabs, and RTL space widths are lost before shaping.
- `snapToDevice` and `glyphPosition` use `Math.floor`, i.e. a systematic
  left/down bias of up to 0.12 pt per vertex/origin instead of unbiased
  rounding. Over a 20-word line this accumulates.

This ADR proposes (a) a spacing-first test strategy sensitive to 0.1–0.5 pt
errors, and (b) a set of novel, generic fixes. It is a handoff for other
agents to implement; it contains no code changes.

## Decision

### Part A — spacing-first testing strategy

Add a `spacing` tier between fast unit tests and the 36-dpi gate. All new
thresholds may only be raised as fidelity improves (per ADR-018); reference
PDFs and metrics are never edited to pass.

1. **Pen-trace unit harness (fast, no Poppler).**
   - New test module (e.g. `tests/spacing-fidelity.test.ts` + helper in
     `tools/spacing-trace.ts`) drives `drawStyledStory` /
     `renderPositionedPage` with a recording mock `PdfBackend`.
   - Record per-`drawShapedRun` `(x, y, size, rotation, advances[])` and
     reconstruct the pen after every glyph: `pen += xAdvance * scale`.
   - Assert: line `x` vs saved `run.x` within 0.25 pt; line width vs saved
     `run.width` within 0.5 pt; cumulative pen after the last glyph equals
     `run.x + run.width` within 0.5 pt; word-gap variance across a line
     within 0.25 pt p95 on synthetic fixtures.
   - Runs in `npm test` (fast suite). No Poppler, no reference PDFs.

2. **Glyph-origin diff from emitted vectors (slow, Poppler-gated).**
   - New tool (e.g. `tools/spacing-diff.ts`, CLI `npm run spacing:diff`)
     reuses `vector-diff.ts` SVG `<use>` resolution but replaces greedy
     matching with **reading-order matching**: sort both box lists by
     baseline then x (RTL-aware), align by cluster/logical index, report
     per-glyph `dx`, per-word-gap `dgap`, per-line `widthDelta`.
   - Metrics per sampled page: `p50/p95/max |dx|`, `p95 |dgap|`,
     systematic bias `mean(dx)`, cumulative drift `dx(last)-dx(first)`.
   - Initial gate (SAMPLE2, local-font profile): `p95 |dx| ≤ 1.0 pt`,
     `|mean(dx)| ≤ 0.3 pt`, `p95 |dgap| ≤ 0.5 pt`. Tighten only upward.
   - Gated test `tests/spacing-vector.test.ts` behind
     `SPACING_FIDELITY=1` (mirrors `VISUAL_FIDELITY`/`VECTOR_FIDELITY`),
     e.g. `npm run test:spacing`.

3. **High-resolution 1-D projection check.**
   - Rasterize at 150–300 dpi, compute per-line horizontal ink projections
     for reference vs generated, then cross-correlate along x only. The lag
     of peak correlation is the line's systematic shift in pt; peak width
     measures blur/spread. This catches 0.2 pt shifts invisible at 36 dpi
     while remaining robust to single-glyph outline differences.
   - Store the per-line lag plot as a PNG alongside the existing
     three-panel diff. Human-readable, one image per sampled page.

4. **Word-gap histogram.**
   - From the glyph-origin diff, build a histogram of inter-word gaps per
     page for reference vs generated. Report Earth-mover distance and
     overlay both histograms in the spacing report JSON. Uniform-ratio
     fitting shows up as a scaled/shifted histogram even when endpoints
     match; stretch-zone fixes (Part B) show up as histogram convergence.

5. **Synthetic micro-corpus (deterministic, no reference PDFs needed).**
   - Small hand-built stories exercising one spacing variable at a time:
     double spaces, leading/trailing spaces, tabs, mixed RTL/LTR on one
     line, tracking (`trackingEm`/`trackingPoints`), `characterSpacing` +
     `extraSpace`, `kashidaCount`, `horizontalScale ≠ 1`, rotated 90° run,
     zero/negative-advance overlay run.
   - Each case asserts exact pen positions from the trace harness, not
     raster overlap. This is where regressions in spacing logic are caught
     in the fast suite.

### Part B — novel fix directions (generic, no fixture constants)

Implement in this order. Each must keep `ActualText` logical text unchanged
and keep vector-text-only output.

1. **Unify the pen model (measure ≡ draw).**
   - Single function computes glyph origin increment from
     `(xAdvance, xOffsetDelta, horizontalScale, rotation)` and is used by
     both `measureShapedRun` and `drawShapedRun`. Today measure ignores
     `xOffset` and `horizontalScale` application order differs between
     `positioned-layout.ts`, `styled-layout.ts`, and `pdflib-backend.ts`.
   - Expected effect: removes the standing 0.1–0.5 pt measure/draw split
     that forces the fitter to over-correct.

2. **Replace uniform ratio-fit with stretch-zone distribution.**
   - Keep glyph-internal advances (font truth) immutable. Distribute the
     residual `savedWidth − naturalWidth` only to designated stretch
     zones in priority order: (1) word spaces, (2) kashida slots,
     (3) justified line-end gap, (4) inter-glyph tracking — never by
     multiplying every `xAdvance` by `ratio`.
   - The existing `fitSpaces` branch is the prototype; generalize it and
     delete the generic `itemRatio`/`totalAdvance * ratio` path. Latin
     `characterSpacing`/`extraSpace` already points this way; extend the
     same discipline to Arabic runs.

3. **Unbiased device-grid quantization with error diffusion.**
   - Replace `Math.floor` in `snapToDevice`/`glyphPosition` with
     round-half-even (or round-half-away) and carry the per-glyph rounding
     residual forward along the line (Floyd–Steinberg in 1-D). Line width
     error then stays bounded by ±0.06 pt instead of growing with word
     count. Border vertices keep the 0.12 pt grid (ADR-016) but also round
     instead of flooring.

4. **Space/tab glue preservation.**
   - Stop collapsing whitespace before shaping. Tokenize to
     `(word, glue)` pairs where glue retains exact count/kind
     (`"  "`, `"\t"`). Shape glue in the run's own font/direction
     (RTL spaces in the Arabic font, not LTR fallback) and apply saved
     `extraSpace` per glue unit, not per collapsed token.
   - Tab stops already decoded in `TextStyle.tabStops` should position
     cells from the decoded stop, not from `distance + cellWidth + 36`
     fallback accumulation.

5. **Reference TJ/Tc/Tw priors instead of blind fitting.**
   - Parse the reference PDF content streams (offline tool only, never at
     render time) for `Tc` (char spacing), `Tw` (word spacing), and `TJ`
     kerning arrays. Derive per-case priors for Latin tracking vs Arabic
     word-space scale. Feed them as defaults into the stretch-zone
     distributor. This turns the reference from a pass/fail image into a
     measurement source, consistent with the ADR-019 oracle philosophy.

6. **Continuous kashida, quantized last.**
   - Treat the saved `kashidaCount` length as a continuous stretch budget
     distributed by glyph weight (already done), but apply it as fractional
     advance on the kashida carrier instead of inserting N discrete fixed
     glyphs and then ratio-fitting the line afterward. Quantize to whole
     glyphs only at emission. Removes the current double-correction
     (insert + uniform scale).

7. **Advance calibration table from the oracle (extends ADR-019).**
   - The native oracle currently measures advances. Extend its corpus with
     single-variable spacing probes: `N` spaces, tracking sweep, kashida
     sweep, mixed-font line. Fit a small per-font correction
     `(spaceScale, trackingScale, kashidaUnit)` used by the distributor.
     Small, auditable JSON beside `nooric-tables.json`, not per-document
     tuning.

## Consequences

- Spacing regressions become fast-suite failures (pen trace + micro-corpus)
  instead of invisible 36-dpi passes.
- Line endpoints stay correct (saved extents still constrain), but interiors
  converge because residual goes to spaces/kashidas, not every glyph.
- No fixture identity, object-id branches, or hardcoded coordinates are
  introduced. All priors come from decoded structures or offline reference
  measurement, per ADR-014/ADR-016 genericity rules.
- Cost: one new Poppler-gated tool + one fast trace harness to maintain;
  high-dpi projection roughly doubles `spacing:diff` runtime vs `visual:diff`
  (still sampled pages only).

## Verification

- `npm test` — must pass, including new `tests/spacing-fidelity.test.ts`
  micro-corpus (no Poppler).
- `npm run test:spacing` (`SPACING_FIDELITY=1`) — gated per-glyph/p95-gap
  assertions on sampled pages; initially advisory, promoted to hard gate
  once green for two consecutive runs.
- `npm run test:visual` / `npm run test:vector` — must not regress; 90%/97%
  targets unchanged.
- `npm run typecheck`, `npm run lint` — must pass.
- Every spacing fix PR ships its before/after word-gap histogram + 1-D lag
  plot under `tmp/pdfs/spacing-diff/` (gitignored, same convention as
  `tmp/pdfs/visual-diff/`).

## Implementation notes (2026-11-12)

Shipped:

- **Part A, items 1–5.** `tools/spacing-trace.ts` (recording backend + pen
  reconstruction), `tests/spacing-fidelity.test.ts` (10-case synthetic
  micro-corpus in the fast suite), `tools/spacing-metrics.ts` +
  `tests/spacing-metrics.test.ts` (reading-order alignment, gap histograms,
  1-D lag), `tools/spacing-diff.ts` + `npm run spacing:diff` (SVG glyph boxes,
  high-dpi projection, per-line lag PNG), and the
  `tests/spacing-vector.test.ts` / `npm run test:spacing` gate. It is a hard
  gate after two identical green runs; `SPACING_ADVISORY=1` reports without
  failing.
- **Part B, item 1.** `packages/pdf-renderer/src/pen-model.ts` is now the single
  origin/advance model used by `measureShapedRun`, `drawShapedRun`, and the
  trace harness.
- **Part B, item 2.** Residual distribution lives in `styled-layout.ts`
  (`distributeResidual`: glue → kashida carriers → tracking → symbol cell).
  It is enabled for all-Arabic RTL saved lines that carry decoded word-space or
  kashida stretches. Other lines keep the uniform fallback: universal zone
  redistribution was measured against the fixtures and cost ~1.6 points of
  36-dpi ink overlap (86.87% vs 88.45% baseline), so the ADR's "delete the
  ratio path" recommendation is not adopted without the Phase-4 calibration.
- **Part B, item 6.** Kashida carriers receive the residual as a fractional
  advance after native glyph insertion, so the line is no longer inserted and
  then ratio-corrected. Enabling this on kashida-only Arabic lines measured
  88.47% visual / 97.43% vector (baseline 88.45% / 97.43%).
- **Part B, item 4.** Styled and positioned tokenizers preserve exact glue runs
  and shape glue in the run direction. Trailing glue is retained only when the
  saved run carries spacing metadata: retaining it unconditionally moved
  interior words and cost ~1.6 points of visual overlap.
- **Part B, item 5 (both halves).** `tools/spacing-priors.ts` +
  `npm run spacing:priors` extract `Tc`/`Tw`/`TJ` from reference content
  streams. The SAMPLE2 reference uses no `Tc`/`Tw`; it has 695 `TJ`
  adjustments (median −0.84, p95 |x| 543). `RenderTypography.spacingPriors`
  now feeds `characterSpacing`/`wordSpacing` as defaults into the saved-line
  distributor when a run carries no decoded spacing. Defaults are absent, so
  rendering is unchanged unless a caller supplies priors.
- **Part B, item 7.** `packages/pdf-renderer/src/spacing-calibration.ts`
  defines the per-font `(spaceScale, trackingScale, kashidaUnit)` model and
  identity resolution. `tools/spacing-calibration.ts` fits it from oracle
  probes; `tools/run-spacing-calibration.ts` / `npm run spacing:calibrate`
  emits the probe corpus (`--probes --font …`), fits measured oracle JSON
  (`--oracle …`), or fits hand-transcribed samples. `run-nooric-oracle.ts`
  passes `probe` metadata through into its JSON. `loadInPageTypography` loads
  `spacing-calibration.json` beside `nooric-tables.json` when present.
  Identity defaults mean the checked-in gates are unchanged; non-identity
  values are exercised by the micro-corpus.
  The probe documents are generated for a native InPage install (no Wine):
  `npm run spacing:calibrate -- --manifest --font-name "Noori Nastaliq"
  --fonts-dir fonts/inpage-local --dpi 300` writes an oracle manifest with the
  natural advances already filled in plus a `spacing-probes.md` checklist.
  Probes use non-joining markers and same-marker baselines; pixel measurements
  are converted with the recorded DPI. After exporting the PDFs, run
  `npm run spacing:rasterize` and then the oracle/calibrate commands listed in
  the generated checklist.

Falsified hypotheses (kept as negative results):

- **Part B, item 3.** Replacing `Math.floor` with rounding in `snapToDevice` /
  `glyphPosition` regressed SAMPLE2 visual overlap from 88.45% to ~87.1%
  (glyph rounding is the larger share). The reference raster reproducibly
  matches floor, so the native 0.12 pt grid and floor are retained;
  `rotation.test.ts` documents the result. Error diffusion with rounding added
  no measurable benefit.
- Universal stretch-zone fitting, described above.

Measured gates after implementation: `npm run test:vector` 97.43% (gate 97%),
`npm run test:visual` 88.47% (gate 90%, same pre-existing shortfall as the
baseline), `npm test` green, `npm run typecheck` clean. `npm run test:spacing`
reports p95 |dx| 0.840 pt, |bias| 0.023 pt, p95 |dgap| 0.277 pt, gap EMD
0.037 pt — all inside the proposed initial thresholds (1.0 / 0.3 / 0.5 pt),
stable over two consecutive runs, so the gate is enforced by default.

Resolved open questions:

- `extraSpace` is per space glyph (the decoder already divides by the run's
  space count); the fit path applies it per glyph, covered by the micro-corpus.
- `paintedSize` quantization is unchanged.
- Tab alignment enum mapping is unchanged pending a right/decimal-tab fixture.

All Phase-4 items are implemented. The probe corpus still needs a human to
author the controlled documents in the native InPage install; until
`spacing-calibration.json` is produced, the identity defaults keep the existing
gates and measurements unchanged. Wine is not required.

## Considered options

1. **Tighten 36-dpi threshold (rejected).** Still blind below ~2 pt; raises
   false failures from outline differences without diagnosing spacing.
2. **Lower vector tolerance to 0.5 pt with current greedy matcher
   (rejected).** Produces mismatch noise from outline-shape differences,
   not actionable spacing signal. Reading-order alignment is required first.
3. **Per-document advance tuning to hit endpoints (rejected).** This is what
   uniform ratio-fitting already does; it games the metric and violates the
   no-fixture-magic rule.
4. **This proposal (chosen).** Separates endpoint accuracy (saved extents)
   from interior accuracy (stretch zones) and measures interiors directly.

## Open questions for implementers

- Exact `extraSpace` semantics for `0x7f80` runs when spaces are preserved
  (per-glue vs per-line) — confirm against `readRunSpacing` divisor.
- Whether `paintedSize` quantization (`glyphPositionDpi`) should apply to
  measurement as well, or be removed for non-GDI fonts.
- Tab-stop `alignment` enum mapping for right/decimal tabs in styled runs.

## Implementation handoff (suggested phase order)

1. Phase 1 (harness): pen-trace helper + `tests/spacing-fidelity.test.ts`
   micro-corpus + `npm run test:spacing` skeleton (advisory only).
2. Phase 2 (measure): `tools/spacing-diff.ts` reading-order diff + gap
   histogram + 1-D lag plot; wire `spacing:diff` npm script.
3. Phase 3 (fixes): pen-model unification → stretch-zone distributor →
   unbiased quantization → glue preservation → kashida-continuous.
4. Phase 4 (calibration): TJ-prior extractor + oracle spacing probes;
   promote spacing gate to hard fail.
