# inpage-viewer

Convert legacy InPage `.inp` documents to searchable PDF, with an independent
TypeScript implementation and a layered architecture (CFB → parser → model →
PDF).

## Status

Milestone 1 is a **searchable text PDF**. Text extraction and source page-size
preservation from verified InPage 1.x files work. Portable HarfBuzz/WASM
Nastaliq shaping and positioned-glyph PDF embedding are implemented; font
fallback, source styles, and full layout fidelity are **not** implemented yet. See
[COMPATIBILITY.md](./COMPATIBILITY.md) for an honest feature matrix.

## Install

```bash
npm install
```

Requires Node.js 18+. The default fallback font (Noto Nastaliq Urdu) is vendored
under `fonts/` and shipped under the SIL Open Font License.

### Local InPage fonts (experimental)

```bash
npm run fonts:import -- "/path/to/Inpage 2018"
npm run fonts:preview
npm run audit:references -- --case sample --inpage-fonts fonts/inpage-local
```

This copies the original fonts and ligature data into ignored local storage,
then uses verified whole-word Noori glyphs, source widths, and two-component
overlays with Unicode fallback for unmatched words. It also extracts the
native NOORIC record tables (`nooric-tables.json`) for the character shaper.
The preview is `output/pdf/inpage-font-comparison.pdf`; audit output is
`tmp/pdfs/inpage-font-audit/`. With the local-font profile, SAMPLE2 currently
scores **81.62%** ink overlap at 36 dpi (the default Noto path is lower). See
[font recovery findings](./docs/research/inpage-font-banks.md) and the
[reverse-engineering notes](./docs/reverse-engineering/README.md).

## Usage

### Library

```ts
import { openInPage, renderPdf, setDefaultFallbackFont } from "@inpage/converter";
import { NodeFallbackFont } from "@inpage/pdf-renderer";

setDefaultFallbackFont(new NodeFallbackFont(async () => fontBytes));

const document = await openInPage(inputBytes, { strict: false });
const pdfBytes = await renderPdf(document, {
  preservePageSize: true,
  embedFonts: true,
  searchableText: true,
});
```

### CLI

```bash
inp2pdf input.inp --output output.pdf
inp2pdf inspect input.inp
inp2pdf extract input.inp --output output.txt
inp2pdf render input.inp --pages 1-3 --format png   # phase 2 (not implemented)
```

## Testing

```bash
npm test                       # fast unit and integration suite
npm run test:references        # verify all supplied INP/PDF reference pairs
npm run test:visual            # gated SAMPLE2 >= 90% ink-overlap check
npm run audit:references       # metadata, searchable-text, and raster report
npm run visual:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
```

The reference audit and visual diff write generated PDFs, rasters, and a
three-panel diff PNG (reference | generated | diff) under `tmp/pdfs/`. Poppler
(`pdftoppm`, `pdftotext`, `pdfinfo`) must be available; `visual:diff` also
locates a winget Poppler install automatically. See
[tests/README.md](./tests/README.md) and ADR-018.

## Reverse engineering

Undocumented format behavior is verified against the installed InPage binary
(REA + Ghidra) and recorded as text evidence in
[docs/reverse-engineering](./docs/reverse-engineering/README.md). The vendor
binary, fonts, and data are never committed; see ADR-014 for the workflow.
Generic decoding decisions are recorded in ADRs 015–018.

## Architecture

```
packages/
  cfb/            safe read-only OLE2/CFB reader
  diagnostics/    structured diagnostics + confidence levels
  document-model/ normalized intermediate model
  inp-parser/     version detection, v1/v2/v3 decode, metadata, images
  text-shaper/    portable HarfBuzz/WASM → positioned glyph runs
  layout-engine/  page/content boxes; future frames/columns
  pdf-renderer/   PdfBackend abstraction + pdf-lib
  converter/      public API
  cli/            inp2pdf binary
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [FORMAT.md](./FORMAT.md) for details.

## License

MIT. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
