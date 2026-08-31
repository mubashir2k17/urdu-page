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
| Embedded images / previews | ⚠️ Partial | Hex-suffixed `PPicts*` streams and uncompressed indexed/24/32-bit DIBs are decoded; linked images render in positioned mode |
| Arabic shaping / joining | ✅ Working (single font) | Portable HarfBuzz/WASM shapes Noto Nastaliq at book scale; the PDF backend emits its glyph ids and positions directly |
| Font-provider selection | ⚠️ Partial | Exact decoded document-font matches and provider fallback work; per-run style/font ids are not decoded |
| Correct bidi ordering | ⚠️ Partial | Positioned layout segments Urdu, Latin, and neutral word runs; a full Unicode bidi implementation is not present |
| V1 source page setup | ✅ Working | Exact width, height, and margins decoded from verified fixed header fields |
| Page size preservation | ✅ Working for v1 | Renderer uses decoded source width/height; defaults to A4 when unavailable |
| Margin-aware page layout | ⚠️ Partial | Decoded margins define the content box; fixed font size/leading remain |
| Frames and columns | ⚠️ Partial | Verified v1 object bounds, story links, rotation, and multi-column count render in opt-in positioned mode |
| Tables, borders, rules | ⚠️ Partial | Frame borders, basic rules, and callout arrows render; cell styling and pattern fills remain |
| Footnotes, indexes | ❌ Not implemented | Phase 2 |
| Searchable PDF text | ✅ Working | Logical Unicode is stored as `ActualText`; text is extractable via `pdftotext` |
| Font embedding | ✅ Working | Identity CID-to-glyph mapping with full embedding; pdf-lib/fontkit does not reshape text |
| Golden visual-diff | ⚠️ Harness working | Four supplied PDF pairs are audited; Sample 2 positioned overlap is 14.3% |

## Reference audit baseline

Run `npm run audit:references`. The normal audit records known mismatches without
failing; add `-- --strict` when using it as an acceptance gate.
Pass `-- --font /absolute/path/to/font.ttf` to compare another licensed font
without editing the harness.
Pass `-- --case sample` to run only the matching reference case.

| Reference | Generated/reference pages | First-page size | Sampled ink overlap |
|---|---:|---:|---:|
| Font catalogue | 5 / 2 | Match (A4) | 1.8% |
| A3 sample | 1 / 1 | Match (A3 output; source composition remains A4) | 14.3% |
| Book body | 281 / 241 | Match (Letter) | 8.5% |
| Book table of contents | 15 / 12 | Match (Letter) | 1.3% |

These figures are a diagnostic baseline, not an accepted quality threshold.
The audit uses representative pages for the long documents and ignores pairs of
pages that are both blank when averaging visual overlap.

## Known limitations (milestone 1)

- **Single-font shaping only**: the PDF backend now embeds positioned HarfBuzz
  glyphs from the vendored Noto Nastaliq Urdu font, but per-run font fallback
  and source-font matching are not implemented yet.
- **Layout styling incomplete**: verified v1 frame geometry, story links,
  columns, and rotation render in opt-in positioned mode. Per-run font, size,
  color, cell style, pattern, and outline records are not decoded yet.
- **Print media is separate from source setup**: `SAMPLE2.INP` is A4 although
  its paired reference PDF was exported on A3 media.
- **Image formats partial**: linked uncompressed DIBs render; compressed DIBs
  and unlinked preview/artwork streams remain unsupported.
- **Font subsetting disabled** due to a fontkit GPOS crash on complex Arabic fonts
  (full embedding is used, which is larger but safe).
