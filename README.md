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
overlays with Unicode fallback for unmatched words.
The preview is `output/pdf/inpage-font-comparison.pdf`; experimental
audit output is `tmp/pdfs/inpage-font-audit/`. Noto remains the default: Sample 2
currently scores 14.2% overlap with original word glyphs versus 14.3% default.
See [font recovery findings](./docs/research/inpage-font-banks.md) for supported
data identity, offsets, rendering limits, and reproduction steps.

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
npm test                  # fast unit and integration suite
npm run test:references   # verify all supplied INP/PDF reference pairs
npm run audit:references  # metadata, searchable-text, and sampled raster report
npm run audit:references -- --strict  # fail while any reference mismatch remains
```

The reference audit writes generated PDFs, page rasters, and `report.json` under
`tmp/pdfs/reference-audit/`. See [tests/README.md](./tests/README.md) for the
manifest, comparison rules, and current limitations.

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
