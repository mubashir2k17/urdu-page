# InPage v1/v2 page geometry

Date: 2026-08-30

## Result

The four paired v1 fixtures reveal a fixed document-setup block near the start
of the extracted `InPage100` stream. It encodes page width, page height, and the
four page margins as unsigned 32-bit little-endian values in **1/2000 point**
units.

This is a finding from the binary fixtures and their reference PDFs, not a
layout feature already documented or implemented by the cited
`iamahsanmehmood/inpage-format` project. That project explicitly leaves page
properties, frame coordinates, and columns undecoded.

## Exact v1 header layout

All offsets below are relative to byte zero of the extracted `InPage100`
stream, not to the outer OLE/CFB file.

| Tag offset | Tag bytes | Value offset | Meaning | Encoding |
|---:|---|---:|---|---|
| `0x10E` | `06 01` | `0x110` | page width | `u32le / 2000` points |
| `0x114` | `07 01` | `0x116` | page height | `u32le / 2000` points |
| `0x11A` | `08 01` | `0x11C` | left margin | `u32le / 2000` points |
| `0x120` | `09 01` | `0x122` | top margin | `u32le / 2000` points |
| `0x126` | `0A 01` | `0x128` | right margin | `u32le / 2000` points |
| `0x12C` | `0B 01` | `0x12E` | bottom margin | `u32le / 2000` points |

In other words, these six properties occupy six bytes apiece:

```text
[propertyId: u8] [group: u8 = 0x01] [value: u32le]
```

The byte sequence from `0x10E` is therefore:

```text
06 01 <width:u32le>
07 01 <height:u32le>
08 01 <left:u32le>
09 01 <top:u32le>
0A 01 <right:u32le>
0B 01 <bottom:u32le>
```

This is important because the external spec describes a generic four-byte
`[propId:u8][group:u8][value:u16le]` property form. That description does not
cover these page geometry values. Reusing its 16-bit parser for this header
block would misalign every property after `0x10E`.

### Fixture evidence

| INP fixture | Raw width / height | Decoded page (pt) | Raw L / T / R / B | Decoded margins (pt) |
|---|---:|---:|---:|---:|
| `FONTS.INP` | `1190551 / 1683779` | `595.2755 x 841.8895` | `72000 / 72000 / 72000 / 72000` | `36 / 36 / 36 / 36` |
| `SAMPLE2.INP` | `1190551 / 1683779` | `595.2755 x 841.8895` | `72000 / 72000 / 72000 / 72000` | `36 / 36 / 36 / 36` |
| `book part1.inp` | `1223999 / 1583999` | `611.9995 x 791.9995` | `324000 / 108000 / 324000 / 432000` | `162 / 54 / 162 / 216` |
| `book table of contents.inp` | `1224000 / 1584000` | `612 x 792` | `324000 / 108000 / 324000 / 468000` | `162 / 54 / 162 / 234` |

The two small fixtures in `fixtures/inp/` have the same `611.9995 x 791.9995`
page and `162 / 54 / 162 / 216` margins as `book part1.inp`.

The paired PDFs independently corroborate both the unit and the margin order:

- `FONTS.pdf` is A4 (`595.32 x 841.92` points); first-page extracted words
  start at x `36.60` and y `37.68`, consistent with 36-point left/top margins.
- On page 2 of `book part1.pdf`, body text starts around x `162.00` and y
  `52.26`, ends around x `449.88` and y `573.96`, and the page is `612 x 792`.
  The decoded content boundaries are x `162..450` and y `54..576`.

Small differences for the A4 dimensions (`0.0445` and `0.0305` point) are
consistent with the PDF writer rounding the standard A4 media box.

Confidence: **high** for offsets, endianness, `2000 units = 1 point`, width,
height, and the L/T/R/B field order within this family of v1 files. Confidence
for v2 is **unverified** because this repository currently has no
`InPage200` fixture.

## `SAMPLE2`: source page versus printed page

`SAMPLE2.INP` encodes A4, not A3. Its six page-geometry fields are byte-for-byte
the same as `FONTS.INP`. `SAMPLE2.pdf` nevertheless has an A3 media box
(`841.92 x 1190.52` points), and the PDF's extracted first-page text remains in
approximately the upper-left A4-sized region (x `36..568`, y `36..817`).

The most conservative conclusion is that the PDF records a print/export paper
choice which is not the source document page setup. Consequently, the current
reference harness must not use the A3 PDF media box as the expected
`preservePageSize` result for `SAMPLE2.INP`; the expected source page is A4.

Confidence: **high** that the INP header is A4; **medium** that the discrepancy
specifically arose from print/export configuration, because the act of
producing the reference PDF was not observed.

## Orientation and paper names

No separate orientation field or authoritative paper-size enumeration was
identified. The confirmed fields store width and height directly. For current
purposes, orientation can safely be *derived* (`width > height` means
landscape), and a friendly paper name can be inferred by tolerance against
standard dimensions. Neither derived value should be represented as a decoded
InPage flag.

All available v1 source fixtures are portrait. A controlled pair of otherwise
identical portrait and landscape files is still required to determine whether
InPage also stores a redundant orientation flag.

Confidence: **high** that direct dimensions are present; **low/unverified** for
any separate orientation or paper-kind property.

## Frames, columns, and page-level group `0x03`

No primary source examined provides exact offsets or property IDs for text-box
coordinates, frames, columns, master pages, or a named document-setup record.

The `inpage-format` specification says:

- properties commonly appear as `[propId:u8][group:u8][value:u16le]`;
- group `0x03` is page-level but is “not yet analyzed”;
- text-box/frame coordinates and column settings are unknown;
- `0x01:0x0D = 1` is only suspected to be a frame flag.

Its TypeScript implementation reinforces that limit: `parseV3InlineProperties`
advances past group `0x03` without interpreting it, and `DocumentFormat`
contains only fonts, colors, a default style, and paragraph styles. It exposes
no page geometry or frame model.

Repeated property blocks containing the same page dimensions occur later in
`FONTS.INP` and `SAMPLE2.INP` (for example, A4 width values at `0xB7A` and
`0xCB2` in `FONTS.INP`). These repetitions are evidence of duplicated object or
style data, but do **not** establish frame semantics. The fixed header block is
the only geometry decoder supported by the current evidence.

Confidence: **high** that the cited external implementation does not decode
these features; **no conclusion** about the binary meaning of the repeated
blocks.

## Implementation implication

A minimal v1 decoder can be evidence-based and defensive:

1. Require `InPage100` length of at least `0x132` bytes.
2. Verify the six tag pairs exactly at `0x10E`, `0x114`, `0x11A`, `0x120`,
   `0x126`, and `0x12C` before reading values.
3. Read each value as unsigned little-endian 32-bit and divide by `2000`.
4. Preserve the exact numeric dimensions in the document model; paper-name and
   orientation classification are derived conveniences only.
5. If validation fails, retain the existing unknown-geometry fallback rather
   than scanning arbitrary occurrences of the tags.

This should initially be described as a v1 header decoder. Extending it to v2
without an `InPage200` fixture would be an assumption, not a verified format
claim.

## Primary sources

- `iamahsanmehmood/inpage-format`,
  [`specs/06-formatting-structures.md`](https://github.com/iamahsanmehmood/inpage-format/blob/main/specs/06-formatting-structures.md): generic tag-value format, approximate units, page group `0x03`, and explicit frame/column unknowns.
- `iamahsanmehmood/inpage-format`,
  [`lib/javascript/src/format-extractor.ts`](https://github.com/iamahsanmehmood/inpage-format/blob/main/lib/javascript/src/format-extractor.ts): skips page-level group `0x03` and has no geometry fields in its public `DocumentFormat`.
- `KamalAbdali/InpageToUnicode`,
  [`Readme.txt`](https://github.com/KamalAbdali/InpageToUnicode/blob/master/Readme.txt): the author states that document structure and formatting controls are nonpublic and deliberately emits unformatted text.
- Local primary artifacts:
  [`tests/FONTS.INP`](../../tests/FONTS.INP),
  [`tests/SAMPLE2.INP`](../../tests/SAMPLE2.INP),
  [`tests/book part1.inp`](<../../tests/book part1.inp>),
  [`tests/book table of contents.inp`](<../../tests/book table of contents.inp>),
  and their paired PDFs. The fixture identities used for this analysis are
  recorded below.

### Fixture SHA-256

```text
835b5057774b33e9f20178c761e2efcafc6dfe08ba41826d2b02af61bd507ca0  FONTS.INP
25304cfd7931c051b5b1bec5e7d297398f6037e49365e6a2c8b2dfef960a914c  SAMPLE2.INP
7b3ca22814044452c7ca4346f8d4a55a1ae3fa8f32b3ceaca135a62fe27eea04  book part1.inp
70910dfc10690e2bd527013a558a9fa1d47e11a93735f3e39a2439cf7178dce1  book table of contents.inp
50c7145057b304ba67b7a22021fa18d480a3e58fd6f94228c190053f200af3ca  FONTS.pdf
e305aedcd129248a07f2999df6f6ee78081e0f467b7ce20c8a5b388e4c773e86  SAMPLE2.pdf
a6fc70fcf86a462f05a6e96b64e6f4a0843a2d9ef8b149e8be52ca94730cc092  book part1.pdf
4d0bf921c6c32f0e875fa07df386cf3c828fa18a5e440eb5dc77c67bb51de3c3  book table of contents.pdf
```
