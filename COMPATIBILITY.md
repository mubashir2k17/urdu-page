# Compatibility

Honest feature matrix. "Working" means unit + malformed-input tests plus at least
one integration fixture. Nothing is claimed "fully compatible" until golden-file
visual-diff tests demonstrate it.

## Format versions

| Version | Stream | Text extraction | Notes |
|---|---|---|---|
| InPage 1.x | `InPage100` | ✅ Working | Legacy `0x04`-prefix encoding; dense-text regions located by `04` density |
| InPage 2.x | `InPage200` | ⚠️ Spec-driven | Same decoder as v1, no v2 fixture yet |
| InPage 3.x | `InPage300` | ⚠️ Spec-driven | UTF-16LE + struct array; no v3 fixture yet |

## Feature matrix

| Feature | Status | Notes |
|---|---|---|
| OLE2/CFB container parsing | ✅ Working | Own defensive reader; 512/4096 sectors, mini-FAT, cycle detection |
| Version detection | ✅ Working | From stream name |
| V1/V2 legacy decoding | ✅ Working | Composites before singles, `pendingSpace` word boundaries, ASCII runs kept verbatim, `0D <u32 LE len>` record headers inside dense-text regions |
| V3 decoding | ⚠️ Spec-driven | Not fixture-verified |
| Mixed Urdu/English text | ✅ Working | ASCII runs (Latin letters, digits, punctuation) kept verbatim between tabs |
| Font name extraction | ✅ Working (medium confidence) | ASCII + UTF-16LE |
| Color palette extraction | ⚠️ Approximate | RGB values are best-effort |
| Document metadata | ⚠️ Approximate | Title/author heuristics |
| Embedded images / previews | ⚠️ Retained only | Detected and preserved, not decoded/rendered |
| Arabic shaping / joining | ⚠️ Partial | fontkit joins the Noto Sans fallback; full HarfBuzz/Nastaliq parity is not implemented |
| Font-provider selection | ⚠️ Partial | Exact decoded document-font matches and provider fallback work; per-run style/font ids are not decoded |
| Correct bidi ordering | ⚠️ Partial | Logical RTL works for current fixtures; full mixed-script bidi is not implemented |
| V1 source page setup | ✅ Working | Exact width, height, and margins decoded from verified fixed header fields |
| Page size preservation | ✅ Working for v1 | Renderer uses decoded source width/height; defaults to A4 when unavailable |
| Margin-aware page layout | ⚠️ Partial | Decoded margins define the content box; fixed font size/leading remain |
| Frames and columns | ❌ Not implemented | Binary coordinates and column settings remain unknown |
| Tables, borders, rules | ❌ Not implemented | Phase 2 |
| Footnotes, indexes | ❌ Not implemented | Phase 2 |
| Searchable PDF text | ✅ Working | Text is extractable via `pdftotext`; sampled pages render with measurable ink overlap |
| Font embedding | ✅ Working | Full embed (subset crashes fontkit on complex Arabic) |
| Golden visual-diff | ⚠️ Harness working | Four supplied PDF pairs are audited; current sampled ink overlap is 0.8-5.0% |

## Reference audit baseline

Run `npm run audit:references`. The normal audit records known mismatches without
failing; add `-- --strict` when using it as an acceptance gate.
Pass `-- --font /absolute/path/to/font.ttf` to compare another licensed font
without editing the harness.

| Reference | Generated/reference pages | First-page size | Sampled ink overlap |
|---|---:|---:|---:|
| Font catalogue | 5 / 2 | Match (A4) | 0.8% |
| A3 sample | 3 / 1 | Intentional mismatch: source A4, reference print media A3 | 0.9% |
| Book body | 292 / 241 | Match (Letter) | 5.0% |
| Book table of contents | 15 / 12 | Match (Letter) | 0.8% |

These figures are a diagnostic baseline, not an accepted quality threshold.
The audit uses representative pages for the long documents and ignores pairs of
pages that are both blank when averaging visual overlap.

## Known limitations (milestone 1)

- **No faithful Nastaliq backend**: the Noto Sans fallback is joined and
  searchable, but does not reproduce the reference calligraphy. Official Noto
  Nastaliq builds currently crash or exhaust memory in fontkit at book scale.
- **Layout geometry incomplete**: v1 source page size and margins are decoded
  and applied, but frame/column coordinates remain unknown. Fixed 12-point type,
  1.6 line height, and paragraph spacing still cause pagination differences.
- **Print media is separate from source setup**: `SAMPLE2.INP` is A4 although
  its paired reference PDF was exported on A3 media.
- **Images/previews** retained in the model, not yet rendered.
- **Font subsetting disabled** due to a fontkit GPOS crash on complex Arabic fonts
  (full embedding is used, which is larger but safe).
