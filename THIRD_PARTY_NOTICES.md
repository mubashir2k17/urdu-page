# Third-Party Notices

This project is MIT-licensed. The following third-party works were consulted or
incorporated, with provenance.

## Incorporated (MIT / permissive)

- **`iamahsanmehmood/inpage-format`** (MIT) — primary reverse-engineering spec:
  container layout, v1/v2 legacy encoding, v3 framing, character maps, formatting
  structures, security guidance. The character map in
  `packages/inp-parser/src/charmap.ts` is derived from its `specs/05-character-maps.md`.
  Character mapping data is factual Unicode assignment data. License: MIT.
  Source: https://github.com/iamahsanmehmood/inpage-format

- **`pdf-lib`** (MIT) — PDF generation backend. Source: https://github.com/Hopding/pdf-lib
- **`@pdf-lib/fontkit`** (MIT) — font embedding. Source: https://github.com/Hopding/pdf-lib

- **Noto Sans Arabic** (SIL Open Font License 1.1) — vendored fallback font in
  `fonts/NotoSansArabic-Regular.ttf`. License: `fonts/OFL.txt`.
  Source: https://github.com/google/fonts/tree/main/ofl/notosansarabic

- **Microsoft `[MS-CFB]` Compound File Binary File Format** — canonical CFB
  layout used to guide the reader. Open specification.

## Consulted as leads (not incorporated)

- **KamalAbdali/InpageToUnicode** (no license / all-rights-reserved) — record
  framing lead and `story.inp`/`story.txt` text-golden pair. Reviewed for the
  length-prefixed record structure; independently verified against fixtures, not
  copied. Source: https://github.com/KamalAbdali/InpageToUnicode

- **zanysoft/unicode-inpage-converter** (MIT) — cross-check for ambiguous byte
  codes (`04 A9` space-vs-kashida, `04 FA`, `04 A3`). Source:
  https://github.com/zanysoft/unicode-inpage-converter

- **salmanasmat/InPageToUnicode** (GPL-3.0) — linguistic edge-case checklist
  (diacritic-tolerant hamza, Bari Yee contextual form, digit reversal). Treated
  as leads only; its logic is not incorporated. Source:
  https://github.com/salmanasmat/InPageToUnicode

- **SheetJS `cfb`** (Apache-2.0) — intended dev-only cross-validation reference
  for the CFB reader (not a runtime dependency).

## Character mapping attribution

The InPage byte→Unicode tables are factual assignments cross-referenced across
the MIT `inpage-format` spec and the public converters above. Prior researchers
are acknowledged in `packages/inp-parser/src/charmap.ts` and in the sources
above.
