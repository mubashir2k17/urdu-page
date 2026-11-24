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
native NOORIC record and selector class tables (`nooric-tables.json`) for the
character shaper, and uses the host's Arial/Unicode-symbol fonts for the
Latin runs InPage references. The preview is
`output/pdf/inpage-font-comparison.pdf`; audit output is
`tmp/pdfs/inpage-font-audit/`. With the local-font profile, SAMPLE2 scores
**88.45%** ink overlap at 36 dpi and **97.43%** page-space glyph match; the
completed Nooric character route is opt-in (`--nooric`) and measures 87.59%
(see ADR-019 for the routing and residual measurements). See
[font recovery findings](./docs/research/inpage-font-banks.md)
and the [reverse-engineering notes](./docs/reverse-engineering/README.md).

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
npm run test:vector            # gated per-outline vector match baseline
npm run test:spacing           # advisory p95 per-glyph/gap spacing gate (ADR-020)
npm run audit:references       # metadata, searchable-text, and raster report
npm run visual:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
npm run vector:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
npm run spacing:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
npm run spacing:priors -- --case "A3 sample"
npm run spacing:calibrate -- --manifest --font-name "Noori Nastaliq" --fonts-dir fonts/inpage-local --dpi 300
npm run spacing:rasterize -- --dir tmp/reverse-engineering/spacing-probes --dpi 300
npm run spacing:calibrate -- --oracle tmp/reverse-engineering/spacing-probes/spacing-oracle.json
npm run nooric:oracle -- --manifest tmp/oracle/manifest.json
```

The reference audit and visual diff write generated PDFs, rasters, and a
three-panel diff PNG (reference | generated | diff) under `tmp/pdfs/`. The
vector diff writes per-page SVGs and a JSON report. The spacing diff writes
per-page SVGs, a word-gap histogram/1-D lag report, and a per-line lag PNG
under `tmp/pdfs/spacing-diff/`. `spacing:calibrate` writes
`fonts/inpage-local/spacing-calibration.json` when present; the renderer loads
it automatically and identity defaults keep output unchanged when it is absent. Poppler (`pdftoppm`,
`pdftocairo`, `pdftotext`, `pdfinfo`) must be available; the diff tools also
locate a winget Poppler install automatically. The oracle manifest points at
rasters produced by the manual native-InPage export workflow (no Wine); the tool never launches the
vendor executable. See [tests/README.md](./tests/README.md), ADR-018, and
ADR-019.

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
