# SAMPLE2 layout recovery, 2026-09-08

The active target is 90% overlap against `tests/SAMPLE2.pdf`, using the existing
grayscale ink intersection/union audit at 36 dpi with no registration correction.
The latest fresh result is **38.5%** (one A3 sheet, source text count 3425, PDF
text count 2949 versus reference 2138). It does not meet the target. The source
INP composition is A4 and the reference export uses an A3 sheet.

## Implemented source evidence

- The v1 text table is accepted only when its length-prefixed paragraphs and
  the following style table cover exactly the same payload bytes. SAMPLE2 has
  30 stories, 6449 payload bytes and 172 style spans. This removes font-table
  strings and binary length prefixes from extracted content.
- Font selectors are group `02` keys 1/2. Group `7f` includes point size (key 0,
  /2000), horizontal scale (1, /1000), weight (2), italic (3), baseline shift
  (5), manual tracking (6), text color (7), outline (0c), alignment (80), and
  line height (8a). Baseline shifts use the downward source coordinate axis.
- Tracking routine `0x409040` treats high word `0x3fff` as a signed low-word
  thousandth-em value; otherwise the value is an absolute document distance.
  SAMPLE2's main heading has adjustments as large as -1.02 em.
- Tab records `93 7f` contain a 32-bit position in /2000 points, a 16-bit
  alignment, and four remaining bytes. The main body rows use stops at 48,
  108.75, 189.75, 264.75, 341.25 and 446.25 points from the right. The final two
  use decimal and left alignment. Header tabs skip stops already passed by the
  preceding cell's content.
- Root +4 selects isolated Noori alternatives. Trie terminals now include
  explicit marked variants. Enabled local mappings: 18026, including 1431
  verified zero-advance overlays, across 89 Noori banks.
- DAT `0x398a4` stores signed right/left spacing bounds for bank/slot pairs.
  `0x40bc69–0x40bd76` limits advances using the previous left boundary and the
  executable's 85-unit clearance. Default advance padding is 65 units.
  `0x40a356` supplies a 150/1000-em ordinary space; `0x40a690–0x40a6ce`
  preserves the kerning boundary across one space and clears it for repeats.
  An Alef followed by the Ki-La ligature contracts from 1064 to 839 units.
- Drawing group `7e`: 0e fill index (0 transparent, 1 white, 2 black, 3 gray),
  05 border width, 15 border style, 19 fill pattern, 1b length-prefixed polygon
  vertices in source page coordinates. Shape selector `05 05`: 0 rectangle,
  1 ellipse, 6 polygon. Source polygon coordinates are used directly.
- Font-family routing uses copied installation fonts. Arial uses its cell to
  em metric ratio; symbol Arabic families use the root table's contextual forms.
  Unsupported Arabic sequences use an explicitly registered Unicode fallback.

## Limits and next work, ordered by visible impact

The main heading still wraps; source tracking is applied, but line fitting and
context across all style changes remain incomplete. Noori baseline placement is
not yet the source program's full baseline algorithm. Alignment value 4 is still
treated as right alignment and needs investigation: the reference footer spreads
individual letters across the frame, suggesting a forced justification mode.

The lower poem's paragraphs carry `e0 7f` two-word references and `e1 7f 02 00`.
Its blank paragraph/cell separators must not become full-height empty lines.
Recover the table/poetry structure rather than selecting SAMPLE2 coordinates.
The data following the style table at offset 23545 also contains serialized
frame data: the first record includes height 60000, width 100950 and object 53,
matching that frame's 30 × 50.475 point dimensions. Its structure may provide
useful line/cell geometry. Offsets here document evidence, not production keys.

Other gaps include missing lower specimen text, lam-alef and mark placement in
symbol Arabic fonts, line wrapping across columns, and exact native borders.
The current pattern 3 hatch and style 15 dashed ellipse approximate the visible
effects; they do not yet decode vendor border artwork. Existing synthesized
arrow geometry also remains approximate.

Rotation regression tests cover 90, -90 and 12 degrees and the entire glyph pen.
Source typography tests cover tracking and tabs; font tests cover signed bounds,
space resets and overlays; source appearance tests cover fills and polygons.
All **78 tests** and root typecheck passed before the latest audit.

## Local native test runtime

Wine 11.0 was downloaded from the WineHQ macOS package maintainer's release and
extracted under ignored `tmp/wine-runtime/`. Its SHA256 matched release metadata:
`b50dc50ec7f41d58b115a6b685d4d1315ba3c797bd3aa0f49213f2703cb82388`.
The isolated prefix requires execution outside the sandbox for its local socket.
InPage initially failed with missing MFC42. The Microsoft VC6 redistributable
was downloaded using the maintained Winetricks recipe and checksum
`c2eb91d9c4448d50e46a32fecbcc3b418706d002beab9b5f4981de552098cee7`.
Only its MFC42 DLL was copied beside the copied InPage executable. No system
font installation or global Wine configuration was required.

The Windows process starts, but Computer Use has not exposed a working InPage
window. Native UI/export experiments are therefore not verified. Do not claim
a native comparison or a native export. Avoid spending the next pass on this
unless it can resolve a large issue quickly.

Reproduce current audit:

```sh
npm run audit:references -- --case sample --inpage-fonts fonts/inpage-local
```

Outputs: ignored `tmp/pdfs/inpage-font-audit/sample2-current.pdf` and
`tmp/pdfs/inpage-font-audit/report.json`. Vendor software/fonts are not committed.
