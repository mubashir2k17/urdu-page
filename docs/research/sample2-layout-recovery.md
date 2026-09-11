# SAMPLE2 layout recovery, 2026-09-09

The active target is 90% overlap against `tests/SAMPLE2.pdf`, using the existing
grayscale ink intersection/union audit at 36 dpi with no registration correction.
The latest fresh result is **77.9%** (one A3 sheet, source text count 3533, PDF
text count 3158 versus reference 2138). It does not meet the target. The source
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
  explicit marked variants. Enabled local mappings: 18065, including 1431
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

## Validated saved layout

The first saved frame group follows the style table at 23555. Records are 62
bytes, start with size 50, and contain content height at +12, column width at
+16 (both /2000 points), and frame ID at +28. Empty ID records delimit stories;
repeated IDs within a group denote columns. SAMPLE2 has 30 groups / 62 records.

The marker at 27399 is `FFFFFFFF 00000000 00000000`. The line table starts at
27411 and covers exactly the same 6449 payload bytes as the text/style pair.
Its 101 records end at 39283. A line stores payload count (+0), height (+4),
paragraph-start flag (+8), record-body length (+12), baseline (+16), run count
(+20), and available width (+28). The body length must be `16 + 30*runCount`.
Each 30-byte run contains kind (+0), source-byte range (+4/+6), and left/right
extents (+8/+12). These are payload offsets, not Unicode scalar indices.

Kinds 7f80 / 7f85 carry Latin / Urdu-Arabic text; 7f87 denotes nested cells.
Children following markers 41429 and 43233 cover the parent cells' 524 bytes.
Cell expansion requires matching source coverage, widths and heights before
accepting all replacements. Positive-width cells follow reverse visual order;
zero-width placeholders carry no child text. This restores both poem columns
and the final two lines in a single cell. Offsets document evidence only;
production parsing scans and validates structural relations.

The renderer derives frame insets and column gaps from the saved dimensions.
It preserves line baselines and negative/zero-width tracked runs. Group 7f keys
8e/8f are paragraph spacing before/after, in /2000 points. Saved line heights
already include this spacing; the before amount adjusts the first baseline.
AASAR's first line was 7.2 points too high without this correction.

Native glyph advances remain incomplete. Saved extents constrain each run;
Noori runs first fit word spaces when this leaves nonnegative space widths,
otherwise they fit advances uniformly. Latin text uses advance fitting, which
retains forced letter spacing in the footer and rotated note. A standalone
Symbol glyph uses its saved cell width to fit the replacement font's size.
These are explicit approximations, not recovered glyph-by-glyph layout.

## Additional font and drawing evidence

- Punctuation boundaries must be separated from joining segments. A source
  hamza participates in terminals such as `یءر`, so it must not split that
  terminal. Advancing isolated punctuation now uses root +4 too.
- Roots C8/C9/CA select advancing `آ/أ/إ`; the earlier generic map incorrectly
  labeled C9/CA as marks. Native Arabic slots are 9d/9c/9e (isolated),
  ab/aa/ac (final). B6/B7/B8 correspond to `ؤ/ئ/ي`. B4 uses Arabic slot bb,
  an alternate sukun. Glyph atlases verify these assignments against copied
  AASAAR assets. Lam–alef slots: 9f/a1, a2/a3, a4/a5, a6/a7 for plain,
  hamza-above, madda, and hamza-below forms.
- Picture properties in group 05: x/y offset keys 1/2, intrinsic width/height
  3/4 (/2000 points), and scale 8/9 (/1000). For SAMPLE2 the saved bitmap size
  becomes 115.92 × 86.94 points. Offsets start inside the three-point border;
  reference image matrices independently confirm this convention.
- Frame border strokes occupy the inside of the source bounds. Reference path
  vertices verify the heading's outer rectangle at the source bounds and its
  three-point border. Style 17 uses diagonal spans; style 15 uses diamonds
  around the ellipse. Repeat dimensions remain approximations, bounded to avoid
  excessive geometry on malformed or extreme widths.
- Optional `fonts/inpage-local/WineSymbol.ttf` is copied from the isolated Wine
  runtime's `share/wine/fonts/symbol.ttf`. HarfBuzz maps U+F0AC to its left-arrow
  glyph; logical ActualText stays U+2190. The font's cell size comes from the
  saved source width. Mac `Symbol.ttf` remains the alternate local fallback.
  Arial variants and Symbol assets are local ignored copies, not repo assets.

## Verification and remaining work

Milestones after commit 09a544f (38.5%): saved lines 58.0%; nested cells 60.3%;
punctuation/hamza 63.1%; advancing punctuation 64.5%; image inset 65.6%; inner
border geometry 68.1%; patterned borders 69.2%; Wine Symbol 70.1%; Arabic forms
70.3%; paragraph spacing 70.7%; Noori word spacing with Latin guard **72.8%**.
The metric and resolution have not changed. A trial using unrestricted native
Noori advances fell to 66.3% and was removed: caches remain necessary.

Full suite: **90/90 passed**, including the Latin-spacing regression. Root
typecheck and the final focused audit passed.
Fresh PDF and raster artifacts live under ignored `tmp/pdfs/inpage-font-audit/`.
The final visually checked preview is `tmp/pdfs/sample2-76.png`. The Noto reference tests still pass; no changes
to the audit threshold or reference inputs have been made.


Regional diagnostics at the previous 72.8% checkpoint (same pixels, no registration):

| Region | Ink overlap |
|---|---:|
| Black panel | 98.3% |
| Table | 88.8% |
| Top poem | 86.3% |
| Lower poem | 85.5% |
| Labels / arrows | 83.2% |
| Heading | 69.4% |
| Columns | 54.4% |
| Font specimens | 54.9% |
| Arabic body | 44.1% |

Regions are diagnostic selections only; the acceptance score remains the whole
page. The specimen, column, heading and Arabic regions contribute the largest
remaining ink differences. Raw regional results are in the ignored audit folder.

The target is still unmet. Highest-impact remaining work:

1. Restore Pashto text (prefix 07, cache kind 7f8b). Applying the Urdu root
   forms directly to NOORIC produces incorrect shapes: its symbol slots differ.
   That trial was removed. The native source routes 7f8b through 0x413c50,
   but the later Noori Character translation still needs recovery.
2. Correct Arabic mark positioning and remaining joining/spacing differences.
3. Recover exact Noori word-boundary spacing and missing original glyph slots.
   The current saved-width fitting improves layout but is not exact shaping.
4. Refine hatch, border pattern phase, and outline thickness.

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

## 2026-09-10: Sindhi, word spacing, and tiling

The fresh unchanged audit is 0.7595340607 (76.0% rounded). Sindhi restoration
raised the checkpoint to 73.1%; preserving character advances while fitting
word spaces for the other Arabic families raised it to 74.1%; PDF hatch tiling
raised it to 76.0%. No reference pixels or glyph coordinates enter rendering.

Prefix 05 has its own alphabet. `sindhi-map.ts` records assignments identified
from atlases generated with the supplied SINDHI.UTF, cross-checked against the
[Unicode Arabic chart](https://www.unicode.org/charts/PDF/U0600.pdf).
The native contextual slot table is at 0x501200 + code*4; the bounded alphabet
is 81–dd, forms isolated/final/medial/initial. Banks e6/e7 are ZoharSindhi and
ZoharSindhi01. Lam + alef uses secondary slots 21/22. The parser keeps script
transitions inside a style span; the Urdu annotation after Sindhi remains in
Noori Nastaliq. Synthetic bold and rarer Sindhi combinations remain incomplete.
Local atlases: `tmp/pdfs/sindhi-atlas.png` and `sindhi-marks.png`.

The Arabic shaper accepts optional ordered glyph substitution stages. Nineteen
mark combinations from native table 0x4ff6a8 are enabled, preserving source
mark order and zero additional advance. The separate table at 0x4ff908 contains
205 rules, including multi-output rules with positional flags; these are not
enabled. A partial single-output trial reduced the score and was removed.
The original source text is retained as ActualText.

Reference pattern 3 is a colored PDF tiling pattern, with a 9×9 cell, type 2,
and a 0.75 scale into page coordinates. Its diagonal occupies the cell's
lower-right clipped portion. A small vector tile reproduces this geometry;
no reference bitmap is imported. Emitting separate page paths instead gives
a different result because pattern cell spacing is quantized by rasterizers.
The pattern resource is page-anchored and independent of each frame's position.

Next diagnostic evidence: `tmp/glyph-positions.py` reads both generated and
reference PDF text matrices. Reference Noori subset glyph IDs retain the
original bank IDs, which allows direct positional comparison. Many column
positions differ by less than 0.1 pt, but groups around some word boundaries
are displaced by 0.5–1.5 pt. Baseline differences on successive 16-pt lines are
0.036, 0.076, 0.116 pt: the reference advances by 15.96 pt, consistent with
rounding each line to a 600-dpi device grid. This is a hypothesis for the next
implementation; no global position correction or metric registration is applied.
`tmp/glyph-deltas.txt` and `tmp/glyph-positions.json` hold the diagnostic output.

That checkpoint preview is `tmp/pdfs/sample2-76.png`; see the next section for the latest result.


## 2026-09-11: Latin spacing and Noori outlines

Fresh audit: **0.7790741554 (77.9%)**. The 90% target remains unmet.
The new preview is `tmp/pdfs/sample2-78.png`. No reference geometry or images
are used as renderer inputs.

Latin cache kind 7f80 has additional spacing fields: +16 is the space count,
+18 is per-character spacing (/2000 pt), and +22 is total additional width
across spaces (/2000 pt). Both ordinary and nested cache readers preserve
these fields. The vertical caption's first run stores 1.0455 pt per character
and 15.684 pt across ten spaces. The footer stores 1.955 pt per character and
26.3985 pt across nine spaces. Apply character and space adjustments before
fitting residual font-metric differences to the saved endpoint. Preserve
boundary spaces in these explicitly spaced runs: the first caption run ends
with three spaces that contribute to its extent. Plain runs retain their
existing boundary-space handling.

This raises the vertical caption's diagnostic overlap to 88.1%. Detailed
reference TJ advances confirm most corrected caption positions are within
0.1–0.2 pt, versus accumulated multi-point displacement before. A trial that
preserved every run's boundary spaces regressed the page and was removed;
equal tracking inferred only from the final width also failed to improve it.

The native Noori space routine distinguishes Noori Nastaliq from other Arabic
families. At 0x40a348–0x40a39f, Noori uses configurable first/repeated space
values; the 150-unit constant is the other-family branch. At 0x40a690–0x40a6ce,
repeated spaces select the second width and reset the previous kerning bound.
The recovered default Noori profile uses zero for the first space, then
150/1000 em for each repeat. This is independently consistent with the
outline run's saved width: 2822 units × 55/1000 = 155.21 pt, exactly its saved
extent. Adding 150 for its ordinary space had forced an incorrect 0.95 advance
scale across the entire run. Saved-width fitting now supports zero-width word
spaces and retains glyph advances when distributing positive remaining width.

Native outline text is stroked vector paths with round joins/caps and a 0.72 pt
stroke (0.96 under the export's 0.75 matrix). The backend obtains outlines from
the same registered font and converts quadratic curves to PDF cubic curves,
applying glyph offsets, font scale, horizontal scale, and frame rotation.
Invisible positioned text with ActualText preserves search/copy semantics.
This avoids text-rasterizer grid fitting for decorative outlines. Diagnostic
outline overlap is now 58.4%; column and specimen regions are 64.3% and 66.2%.
These regional selections are diagnostics; whole-page overlap is the gate.

Line-height rounding to 0.12 pt alone did not improve overall fidelity and was
removed. A trial subtracting space advance from the kerning bound also
regressed the overall result and was removed. Neither correction is enabled.

Pashto investigation located the actual embedded Noori Character tables:
0x4fef8c points to 0x4e7928; the alternate table is at 0x4f34b0, selected through
0x4fef84/0x4fef88. Tables contain 1091 records of 44 bytes. Function 0x413060
selects contextual records; 0x414b90 emits their glyph pieces and marks.
NOORIC uses piece-based character shaping rather than the Arabic root slots.
The missing NASTALIQ.TBL filename does not mean the default table is absent.
Ignored diagnostic atlas: `tmp/pdfs/nooric-all.png`; PE reader:
`tmp/reverse-engineering/pe.py`. This remains unfinished, alongside Arabic
contextual substitutions and precise Noori metrics. Avoid another blind
Urdu-root-to-NOORIC mapping trial.
