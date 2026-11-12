# ADR-019: Native NOORIC pipeline parity and oracle-driven table recovery

- **Status**: Accepted (implemented; fidelity calibration ongoing)
- **Date**: 2026-11-11
- **Builds on**: ADR-011, ADR-012, ADR-014, ADR-017, ADR-018

## Context

`npm run test:visual` gates SAMPLE2 at ≥ 90% ink overlap and currently fails at
81.62% (local-font profile). The ceiling is not layout: ADR-012's saved
`cachedLayout` already recovers line/run endpoints, and the glyph advances are
fitted to those source extents. The remaining error is glyph-level shaping.

InPage does not shape text with OpenType. It uses a custom GDI pipeline —
root table → trie (whole-word ligatures) → 44-byte NOORIC character records →
class tables → context lists → runtime-initialised advance table → `TextOutA`
draw loop — documented in `docs/reverse-engineering/noori-shaping.md`. The
current shapers cannot reproduce this: the whole-word `LegacyLigatureTextShaper`
matches only 83 of 482 distinct SAMPLE2 tokens, and the character-level
`NooricTextShaper` (ADR-017) is missing context-class matching, the runtime
advance table, the face rule, and the ligature post-pass. HarfBuzz over Noto
shapes a different model entirely and can never converge.

## Decision

For InPage Arabic/Urdu/Pashto runs (cached run kinds `0x7f85`, `0x7f8b`,
`0x7f89`, `0x7f8c`), adopt **native-algorithm parity**: complete
`NooricTextShaper` as a faithful byte-level port of the native selector
`FUN_00413060`, the advance/spacing/kashida/mark emitter `FUN_0040a2a0`, and
the class-membership test `FUN_0040eb70`, rather than extending the whole-word
DAT shaper. Concretely this adds:

- context-list matching via the record `+0x10` pointer lists;
- the class tables (`DAT_004e70b8/…/004e78bc`) and their bit semantics;
- the ligature post-pass range rewrite (`FUN_004127c0`);
- the face rule (`styleBias` + NOORIC-family selection) and mark assembly;
- the advance table (`FUN_00409060`), recovered as below.

Resolve the runtime-initialised advance table (`&DAT_0064ab3c` is zero in the
`.data` image and filled at runtime) through an **oracle-driven measurement
harness**: run the real `Inpage 2018_original.exe` under Wine on controlled
single-property documents, rasterise the output, and measure glyph advances,
kerning, and mark positions. Use those measurements to fit and validate the
port instead of waiting for static RE to disambiguate the remaining fields.

Keep HarfBuzz only as a fallback for unmatched content, non-InPage fonts, and
fixture-less v2/v3. Validate incrementally with a **vector-level diff** (extract
the reference PDF's vector paths and compare per-glyph advances/offsets) rather
than only the aggregate 36-dpi raster score.

## Implementation status (2026-11-11)

Implemented:

- `tools/nooric-table.ts` extracts the three native byte class tables and the
  fifteen 0x80-terminated context/range lists alongside the 44-byte records.
  `npm run nooric:validate` checks their contents.
- `NooricTextShaper` now uses class-based joining forms, `+0x10` context-list
  matching, the `+0x14` type filter, the `styleBias` face rule, font-derived
  advance rows, and the decoded `FUN_00412eb0` range rewrite
  (`rewriteToRange`). The remaining `FUN_004127c0` branches are tracked below.
- `FUN_00407e70` was recovered: the runtime advance table is filled by
  measuring the active NOORIC faces. `loadNooricTypography` reproduces that from
  the supplied faces (row 0 = units-per-em, then 256 slot widths).
- `npm run nooric:oracle` measures rasterised single-property documents
  (column ink runs → pen advances); the vendor executable is not launched by
  the tool.
- `npm run vector:diff` resolves Poppler `<use x/y/transform>` placement and
  compares page-space glyph boxes, so advances and offsets are measured, not
  just outline shapes. `npm run test:vector` gates the current match baseline.
- The local typography profile loads the host's Arial, Arial Narrow/Unicode,
  Times/Courier, and Unicode Symbol faces when the imported directory does not
  contain them. SAMPLE2's Latin runs all reference Arial; loading it moved the
  raster score by +4.35 points before any other change.
- `LegacyArabicTextShaper` now falls back per unmapped scalar instead of
  abandoning the whole word. This took SAMPLE2 from 85.97% to 88.11%; preferring
  a Unicode symbol face for the `←` glyphs added another 0.34 points.

Measured on SAMPLE2:

| Profile | Raster overlap | Page-space glyph match |
|---|---:|---:|
| Default local profile (host fonts + mixed fallback) | 88.45% | 97.43% |
| Completed Nooric on the `0x7f8b`/Trad Arabic route | 87.59% | — |

Routing correction found while implementing: the 44-byte NOORIC records are
the Noori Character route. Sending the `0x7f85` Noori Nastaliq runs through
them (the literal four-kind reading of the decision) drops the raster score to
55.04% because those runs use DAT root records and NOORIN banks. The port
therefore routes `0x7f8b`/`0x7f89`/`0x7f8c` with `Trad Arabic`; opening the
root-record character path for `0x7f85` is not a NOORIC change. Whole-word DAT
coverage is already 99% of Noori Nastaliq word occurrences.

The 90% gate is therefore not met by this pass. The remaining raster deficit is
concentrated in the style-17 hatched banner and the ellipse-clipped logo image
(both graphics residuals), plus a few marked-word fallback cases and
glyph-contour differences. The oracle corpus is still needed to confirm the
remaining NOORIC advance/mark fields; it is not the limiting factor for the
dominant Nastaliq body, whose page-space glyph match is 97.4%.

## Considered Options

1. **Complete the native NOORIC port (chosen).** Directly reproduces the
   source-of-truth algorithm; the only path with a fidelity ceiling above 90%.
2. **Extend whole-word DAT mappings + saved-width fitting.** Rejected: bounded
   by the 83/482 token coverage and cannot generalise to unseen documents.
3. **Learned residual correction against a reference raster corpus.** Rejected
   as the primary path: it risks overfitting to one reference and gaming the
   metric, which ADR-018 forbids. Retained as a cross-check only.
4. **OpenType font synthesis / Unicode remapping.** Rejected: the vendor fonts
   are symbol-cmapped with no GSUB/GPOS, so they cannot express the custom
   ligatures and mark placements.
5. **Oracle-driven recovery (chosen companion to 1).** Turns an intractable
   static-RE gap (runtime-initialised `.data`) into a measurement problem and
   produces a ground-truth corpus for the port.

## Consequences

- `NooricTextShaper` is the contextual path for the Noori Character route
  (`0x7f8b`/Trad Arabic) and becomes primary for the remaining InPage kinds once
  the root-record path is recovered. It stays opt-in until the oracle corpus
  clears the measured regression; HarfBuzz remains the fallback. The
  `TextShaper` seam and `ActualText` logical text are unchanged.
- Wine and the vendor binary become dev-only oracle inputs, consistent with
  ADR-014's evidence-driven workflow; neither is committed.
- The 90% gate becomes achievable without modifying the metric or reference
  PDFs. Residual risk: if some class/advance fields remain ambiguous even with
  the oracle, they are approximated from font metrics and recorded as open
  questions in `noori-shaping.md`, not silently tuned to pass.
- The two small non-shaping residuals already isolated in ADR-016 (style-17 dash
  phase, object-35 bevel artifact) remain separate and are not addressed here.
