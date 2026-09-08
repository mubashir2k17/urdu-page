# InPage font banks and ligature data

Inspected 2026-09-07 from the user-supplied `Downloads/Inpage 2018` directory.
This was static inspection with `file`, fontkit, a PE section reader, and LLVM
disassembly. No Windows executable was run; Wine was not needed for this work.
The folder name is not a verified software version: the original executable
and much of the font data date to 1998–1999.

## Reproduce

```sh
npm run fonts:import -- "/path/to/Inpage 2018"
npm run fonts:preview
npm run audit:references -- --case sample --inpage-fonts fonts/inpage-local
```

The importer copies 184 files (82 `.TTF`, 100 `.UTF`, 2 `.FON`) plus
`INPAGEU.DAT` to the ignored `fonts/inpage-local/` directory. Original filenames
are retained. `inventory.json` records each file's SHA-256, size, SFNT tables,
family, glyph count, units per em, and Arabic Unicode coverage. The fonts and
data are local assets, separate from the repository's Noto/OFL assets.

The 100 `.UTF` files are ordinary TrueType SFNTs despite their extension.
All 182 SFNT fonts have zero U+0600–U+06FF coverage and no GSUB/GPOS tables.
Their Windows symbol cmaps use private slots around U+F020–U+F0FF. Generic
PostScript glyph names such as `A` describe slots, not Urdu letters.
Consequently, passing Unicode Urdu directly to these fonts is incorrect.
The two `.FON` files are retained in the inventory but not used by PDF output.

## Identity and static evidence

| Input | SHA-256 |
|---|---|
| `Inpage 2018_original.exe` | `ce5ee2e79d0bf2425e5d5707af736675648048c98f520b9195c70b50ffbee59e` |
| `INPAGEU.DAT` | `b4f4136b8b4e36ebcd3bb101904be79c35786437334fcd8a7e7c89253ba3225d` |

The executable is PE32/i386 with image base `0x400000`. Addresses below are
virtual addresses in that exact executable, not portable function names.

| Address | Observed operation |
|---|---|
| `0x41090f` | References `INPAGEU.DAT` at `0x4e7058`; opens and reads it |
| `0x410a0f–0x410a6c` | Reads and transforms the initial 3000 bytes / 1500 words of the active trie |
| `0x410f10–0x410f45` | XORs a 16-bit word with the supplied key and swaps the bytes |
| `0x410aa6–0x410b33` | Sequential reads of width, offset, character, root, and additional tables |
| `0x413cf1–0x413cff` | Indexes 20-byte root entries by the legacy letter code |
| `0x413f83–0x413fc4` | Scans 8-byte child nodes: child index at +0, count at +2, letter at +3, output pairs at +4/+6 |
| `0x414117–0x41414c` | Emits the recovered output pairs into the shaping buffer |
| `0x4142c3` | Subtracts `0x80` from the encoded bank |
| `0x405b03–0x405b14` | Formats the bank name as `NOORIN%02d` |
| `0x40bc69–0x40bc8d` | Indexes width/offset data by bank and glyph slot |

Local disassembly is in ignored `tmp/reverse-engineering/inpage.asm`. Recreate:

```sh
llvm-objdump -d --x86-asm-syntax=intel "/path/to/Inpage 2018/Inpage 2018_original.exe" > /tmp/inpage.asm
```

## Observed data profile

Only the supplied 352,422-byte DAT is enabled by the importer/loader, using its
SHA-256. The decoder additionally bounds reads, validates pair ranges, rejects
repeated node references/cycles, caps depth, and never mutates the input.

| File offset | Size | Interpretation |
|---|---:|---|
| `0x2334` | `0x2c170` | 22,574 eight-byte trie nodes |
| `0x2e4a4` | `0xb400` | Bank/slot width table; not applied yet |
| `0x398a4` | `0x16800` | Position data; not applied yet |
| `0x500a4` | `0x1c00` | Additional character data; interpretation incomplete |
| `0x51ca4` | `0x1400` | 256 twenty-byte root records |
| `0x530a4` | `0x3000` | Additional metrics; interpretation incomplete |
| `0x560a4` | 2 | Remaining trailer bytes; not interpreted |

The first 3000 trie bytes decode as
`decoded = swap16(encoded XOR 0xa567)`. The routine is verified in disassembly;
this profile's trie base and key were inferred from node structure and checked
by traversing **all 22,574 nodes**, without cycles or out-of-range references.
The other trie bytes and root table are plain. Root +0 is the first child
index; +2 is the child count. Root rendering alternatives are not implemented.

Traversal from legacy letters `0x81` through `0xa7` yields 17,989 terminal
sequence mappings. Outputs are one or two bank/slot pairs. The current adapter
retains only plain-letter sequences with one output component, an available
Noori bank, and an actual nonzero glyph at `U+F000 + slot`; ambiguous Unicode
keys are excluded. This leaves **16,145 mappings across 88 banks**. The two-part
cases require positioning evidence before they can be drawn safely.

Examples verified in the copied font cmaps and comparison rendering:

| Logical word | Font | Glyph ID |
|---|---|---:|
| میں | NOORIN16 | 97 |
| نستعلیق | NOORIN13 | 9 |
| پبلشنگ | NOORIN02 | 121 |
| متن | NOORIN16 | 52 |

The DAT also maps legacy `81 A4 9C` (ایک) to bank 84 / slot `0x65`, but the
supplied `NOORIN84.UTF` has no glyph there. This is an observed data/font
mismatch. The renderer falls back for that word; it does not guess a replacement.

## Initial rendering result and limits

`LegacyLigatureTextShaper` selects complete whitespace-delimited word matches.
Unmatched words, punctuation-attached words, and marked variants retain
HarfBuzz shaping. It preserves logical text and scalar cluster indices, and
normalizes advances into the containing run's units. `ShapedGlyph.fontId`
selects an explicitly registered PDF font resource, returning to the fallback
resource for subsequent glyphs. The whole logical run retains `ActualText`.

Sample 2 contains 73 distinct matching tokens out of 482 distinct
whitespace-delimited tokens in its parsed paragraphs. The complete-page audit
remains one A3 page: **14.1%** sampled ink overlap in this experimental mode,
versus **14.3%** for the unchanged default. Extracted non-whitespace PDF text
counts are 3251 experimental / 3455 default / 2138 reference; these are audit
signals, not a proof of text equivalence or complete frame contents.

The comparison artifact `output/pdf/inpage-font-comparison.pdf` was rasterized
and visually inspected. It shows twelve words with original Noori outlines
beside Noto at the same 24-point size. Original glyphs are typically smaller
at that nominal size, confirming that swapping fonts alone does not recover
InPage's source sizes, spacing, or frame layout.

This is opt-in, partial font interoperability. It does not implement contextual
character fallback, inter-ligature kerning, mark assembly, bidi, run font/style
selection, tables, fills, or source typography. Full bank embedding increases
PDF size. No v2/v3 or other DAT profile support is claimed.

## Continuation: source widths and two-component overlays

The initial milestone is committed as `e9c4ef4`. Further inspection establishes
the following behavior in the same executable and DAT profile:

| Address | Observed operation |
|---|---|
| `0x409269–0x40928a` | Loads the width at `table[bank * 256 + slot]` |
| `0x409287–0x409292` | Returns zero for zero slots or zero widths before division |
| `0x409294–0x4092c8` | Adds spacing for Noori non-space slots; spacing is 65 at executable data address `0x4e514c` |
| `0x4092d4–0x4092e7` | Divides the scaled width by the bank's slot-zero denominator |
| `0x40bda1–0x40bdb5` | Subtracts the advance from the RTL pen before drawing |
| `0x40c27b–0x40c29b` | Draws at the resulting pen origin |

Thus a normal eligible component advances `(width + 65) / denominator` em.
The 65-unit value is the observed executable default, not a decoded document
style. The first table slot is a scale denominator, not a printable glyph.
For advancing banks it is 1000 in this profile. A zero width returns zero even
if the denominator is zero; it must not be replaced with the font's advance.

All **1,422** plain-letter, two-component trie mappings have an advancing first
component and a zero-width second component. The original program advances
before drawing the first, then leaves the pen unchanged for the second.
Drawing them at the same origin therefore follows the observed draw loop.

Example: legacy `82 81` (با) maps to bank 81 / slot `0x21` (a dot layer), then
bank 86 / slot `0x2a` (the body). In the copied cmaps these are glyph IDs 4 and 9.
Bank 81's DAT width is 249 and denominator 1000; bank 86's width and denominator
are both zero. The combined advance is **314/1000 em**, with both outlines at
the same origin. In contrast their font advance widths are 307 and 1000; adding
those would place the components far apart.

The adapter now reads these metrics, accepts same-origin overlay pairs only,
and falls back for missing components. Both emitted glyphs retain the same
logical cluster; the shared advance is applied exactly once. Bounds tests also
reject fractional/out-of-range bank/slot values and nonzero widths with no
denominator. Raw source width/position tables are not applied as generic
font-bounding-box replacements or contextual kerning.

Current support: **17,567 word mappings across 89 banks**. Sample 2 matches 83
distinct tokens out of 482 (initially 73). It remains one A3 page with **14.2%**
sampled ink overlap (initially 14.1%; Noto default 14.3%). The experimental PDF
text count is 3227, versus 3455 default / 2138 reference. Full-layout fidelity
and frame content completeness remain unresolved.

The regenerated comparison PDF visually confirms با, بت, and بٹ assembled
from separate bank 81/86 layers. The complete suite passes **70 tests**,
including three optional local-asset tests, plus root typecheck.

## Next evidence to recover

1. Decode the root record's contextual character alternatives. The branch at
   `0x413de5–0x413e56` selects between alternatives; root pairs must not be
   treated as the trie terminal's overlay pairs.
2. Follow the position table consumers to recover inter-ligature kerning and
   any document-level overrides of the observed spacing defaults.
3. Link source run sizes/font identities and page fills to the renderer.
4. Use Wine for controlled one-property document/export experiments if static
   evidence cannot distinguish the remaining fields.
