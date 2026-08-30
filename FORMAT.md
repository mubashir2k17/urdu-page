# Format

Verified binary-format discoveries, with evidence and confidence levels.

## Container: OLE2/CFB

- **Stream/version**: all InPage documents.
- **Layout**: standard OLE2 Compound File Binary (Microsoft `MS-CFB`).
- **Magic**: `D0 CF 11 E0 A1 B1 1A E1` (8 bytes).
- **Endianness**: little-endian throughout.
- **Evidence**: `fixtures/inp/Final-1.inp`, `Final-2.inp` (both parse cleanly with
  our reader and reveal `Root Entry`, `DocumentInfo`, `InPage100`).
- **Confidence**: high.
- **Tests**: `packages/cfb/src/reader.test.ts`.

Version detection: presence of `InPage100` → v1, `InPage200` → v2, `InPage300` → v3.
Only one content stream is present.

## Legacy encoding (v1/v2)

- **Stream**: `InPage100` / `InPage200`.
- **Scheme**: each Urdu character is `0x04 <index>` (2 bytes). The second byte
  indexes a 110+ entry table. ASCII text and control bytes appear directly.
- **Composites (4 bytes)**: `04 <base> 04 <modifier>`, checked **before** singles:
  - `04 81 04 BF` → U+0623 أ
  - `04 81 04 B3` → U+0622 آ
  - `04 A2 04 BF` → U+0624 ؤ
  - `04 A4 04 BF` → U+06CC U+0626 یئ
- **Control bytes**: `0x0D` paragraph end, `0x0A` soft break, `0x0C` page break,
  `0x09` tab. CRLF counts as one break.
- **Word boundaries**: implicit via `pendingSpace` heuristic — a non-`0x04`
  control byte between sequences signals a word break.
- **Endianness**: n/a (byte-oriented).
- **Evidence**: `Final-1.inp`/`Final-2.inp` decode to readable Urdu prose
  (verified: "ہے لکھنے پر سال کاطویل اور تن", "قاری سے مکالمہ", …).
- **Confidence**: high for letter/number/diacritic map; **medium** for a few
  ambiguous codes (below).
- **Tests**: `packages/inp-parser/src/index.test.ts`, `legacy-decode` in
  `packages/inp-parser/src/legacy-decode.ts`.

### Ambiguous byte codes

| Byte | Candidate A | Candidate B | Verdict | Confidence |
|---|---|---|---|---|
| `04 A9` | Kashida U+0640 | space U+0020 | Kashida (matches MIT spec) | medium |
| `04 FA` | `[` U+005B | empty | `[` (matches MIT spec) | medium |
| `04 A3` | hamza U+0621 | U+0626 | hamza (standalone) | medium |

These follow the MIT `iamahsanmehmood/inpage-format` spec; the alternate values
come from `zanysoft/unicode-inpage-converter` and are not yet confirmed against
a reference.

## Content regions and paragraph records (v1/v2)

- A 6-byte delimiter `0D 00 00 00 00 00` separates a binary preamble from the
  broad content area in the supplied v1 fixtures.
- The remainder is not uniformly record-framed. `FONTS.INP` contains flat
  `04 XX` text; book fixtures mix flat content with
  `0D <length:u32le> <payload ending in 0D>` paragraph records.
- `findTextRegions` selects 512-byte windows with sufficient `0x04` density,
  merges adjacent windows, and decodes the resulting regions flatly. This skips
  font/style/image noise without discarding non-record text.
- **Confidence**: high for delimiter presence and mixed flat/record content in
  v1; spec-driven only for v2 because no v2 fixture is available.

See ADR-005, which supersedes the record-framing decision in ADR-004.

## Page setup (v1)

`InPage100` contains six adjacent tagged `u32le` values at a fixed offset. Each
value uses 2000 units per PDF point.

| Stream offset | Tag | Meaning |
|---:|---|---|
| `0x10E` / value `0x110` | `06 01` | width |
| `0x114` / value `0x116` | `07 01` | height |
| `0x11A` / value `0x11C` | `08 01` | left margin |
| `0x120` / value `0x122` | `09 01` | top margin |
| `0x126` / value `0x128` | `0A 01` | right margin |
| `0x12C` / value `0x12E` | `0B 01` | bottom margin |

All six tags and plausible dimensions/margins are required. Later matching
sequences are not scanned because their object/style semantics are unknown.
Verified source sizes include A4 (`FONTS.INP`, `SAMPLE2.INP`) and Letter (book
body and table of contents). `SAMPLE2.pdf` uses A3 print media, but its source
document setup is A4.

- **Confidence**: high for the supplied v1 family; unverified for v2/v3.
- **Evidence**: `docs/research/inpage-page-geometry.md` and public reference
  harness tests.

## Metadata

- Font names are stored as ASCII (not UTF-16LE) in the `InPage100` stream,
  null-terminated. Verified in `Final-1.inp` at offset ~96480 ("Noori Nastaliq").
- Color names are ASCII null-terminated; RGB values sit at a fixed nearby offset
  but the exact record layout is not yet decoded (approximate).
- `DocumentInfo` is a separate stream; title/author are UTF-16LE key/value.

## Unknowns (documented, retained)

- Page width, height, and margins are decoded for v1. Frame coordinates,
  columns, orientation flags, print-media choices, tables, and headers/footers
  remain **unknown**.
- `PPicts*` streams (embedded previews/images) are retained but not decoded.
- The precise meaning of bytes `0x01`, `0x03`, `0x05–0x0B` in v1/v2 streams is
  unverified (they trigger `pendingSpace`).
