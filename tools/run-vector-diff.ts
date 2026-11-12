// CLI entry for the vector-level PDF diff.
//
// Usage:
//   npm run vector:diff -- [--case "A3 sample"] [--inpage-fonts fonts/inpage-local]
//                         [--out tmp/pdfs/vector-diff] [--tolerance 2] [--nooric]

import { join, resolve } from "node:path";
import { writeFileSync } from "node:fs";

import { vectorDiffCase } from "./vector-diff.js";

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
const tolerance = argumentValue("--tolerance");

const result = await vectorDiffCase(caseName, {
  ...(inpageFonts ? { inpageFonts } : {}),
  ...(outDir ? { outDir } : {}),
  ...(tolerance ? { tolerance: Number(tolerance) } : {}),
  ...(process.argv.includes("--nooric") ? { nooric: true } : {}),
});
for (const page of result.pages) {
  console.log(
    `${result.name} page ${page.page}: ${page.matched}/${Math.max(page.referenceCount, page.generatedCount)} ` +
      `paths (${(page.matchRate * 100).toFixed(2)}%), centre Δ ${page.meanCenterDelta.toFixed(2)}pt, ` +
      `size Δ ${page.meanSizeDelta.toFixed(2)}pt`,
  );
}
console.log(`average path match: ${(result.averageMatchRate * 100).toFixed(2)}%`);
const report = join(resolve(outDir ?? "tmp/pdfs/vector-diff"), "report.json");
writeFileSync(report, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(`Wrote ${report}`);
