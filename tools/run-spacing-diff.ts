// CLI entry for the glyph-origin spacing diff.
//
// Usage:
//   npm run spacing:diff -- [--case "A3 sample"] [--inpage-fonts fonts/inpage-local]
//                           [--out tmp/pdfs/spacing-diff] [--dpi 150] [--max-lag 12] [--nooric]

import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { spacingDiffCase } from "./spacing-diff.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const caseName = argumentValue("--case") ?? "A3 sample";
const inpageFonts = argumentValue("--inpage-fonts");
const outDir = argumentValue("--out");
const dpi = argumentValue("--dpi");
const maxLag = argumentValue("--max-lag");

const result = await spacingDiffCase(caseName, {
  ...(inpageFonts ? {inpageFonts} : {}),
  ...(outDir ? {outDir} : {}),
  ...(dpi ? {dpi: Number(dpi)} : {}),
  ...(maxLag ? {maxLagPoints: Number(maxLag)} : {}),
  ...(process.argv.includes("--nooric") ? {nooric: true} : {}),
});

for (const page of result.pages) {
  const {metrics, histogram} = page;
  console.log(
    `${result.name} page ${page.page}: matched ${metrics.glyphCount}` +
      ` (unmatched ref/gen ${metrics.unmatchedReference}/${metrics.unmatchedGenerated}), ` +
      `|dx| p50/p95/max ${metrics.p50AbsDx.toFixed(3)}/${metrics.p95AbsDx.toFixed(3)}/${metrics.maxAbsDx.toFixed(3)} pt, ` +
      `bias ${metrics.meanDx.toFixed(3)} pt, |dgap| p95 ${metrics.p95AbsDgap.toFixed(3)} pt, ` +
      `drift ${metrics.meanAbsDrift.toFixed(3)} pt, gap EMD ${histogram.earthMover.toFixed(3)} pt`,
  );
  const lagged = page.projections.filter((line) => Math.abs(line.lagPt) >= 0.2);
  console.log(`  lines ${page.projections.length}, shifted >=0.2 pt: ${lagged.length}`);
  console.log(`  lag plot: ${page.lagPlotPng}`);
}

const report = join(resolve(outDir ?? "tmp/pdfs/spacing-diff"), "report.json");
writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Wrote ${report}`);
