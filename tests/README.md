# Reference PDF harness

The reference harness exercises two user-visible seams:

1. the public converter API must open each supplied `.inp`, extract text, and
   produce a structurally readable PDF;
2. standard PDF tooling must be able to observe the expected page geometry,
   searchable text, and visible raster output.

`reference-manifest.ts` is the independent source of expected page counts,
sizes, and representative visual-test pages. Long documents sample the first,
middle, and last page instead of rasterizing every page during routine work.

## Commands

```bash
npm run test:references
npm run audit:references
npm run audit:references -- --strict
npm run test:visual
npm run visual:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
npm run test:vector
npm run vector:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
npm run test:spacing
npm run spacing:diff -- --case "A3 sample" --inpage-fonts fonts/inpage-local
npm run spacing:priors -- --case "A3 sample"
npm run spacing:calibrate -- --manifest --font-name "Noori Nastaliq" --fonts-dir fonts/inpage-local --dpi 300
npm run spacing:rasterize -- --dir tmp/reverse-engineering/spacing-probes --dpi 300
npm run spacing:calibrate -- --oracle tmp/reverse-engineering/spacing-probes/spacing-oracle.json
npm run nooric:oracle -- --manifest tmp/oracle/manifest.json
```

The focused test suite verifies the checked-in reference metadata and confirms
that all four source documents pass through the public conversion API. The
mixed-English assertion verifies the decoder keeps ASCII runs (Latin text,
digits, punctuation) verbatim alongside `04`-prefixed Urdu content. Page-setup
assertions verify A4 and Letter source dimensions, decoded margins, and the
deliberate distinction between `SAMPLE2.INP`'s A4 document setup and its
reference PDF's A3 print media.

The audit writes intermediate generated PDFs, grayscale rasters, and a JSON
report to `tmp/pdfs/reference-audit/`. It compares:

- generated and reference page counts;
- first-page dimensions within one PDF point;
- non-whitespace text extracted by `pdftotext`;
- representative pages rendered by `pdftoppm` at 36 DPI;
- foreground-ink overlap after normalizing raster dimensions.

Normal audit mode exits successfully so known compatibility gaps can be
measured during development. Strict mode exits non-zero unless page count and
size match and every sampled non-blank page reaches 98% ink overlap.

Poppler's `pdfinfo`, `pdftotext`, `pdftoppm`, and `pdftocairo` commands must be
available for the audit, visual/vector diff, and spacing diff commands. The
spacing gate is advisory unless `SPACING_ENFORCE=1` is set, and the fast
`tests/spacing-fidelity.test.ts` micro-corpus runs without Poppler. The fast
Vitest suite does not depend on Poppler.
