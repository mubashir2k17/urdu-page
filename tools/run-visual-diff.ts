// CLI entry for the visual fidelity harness.
//
// Usage:
//   npm run visual:diff -- [--case "A3 sample"] [--dpi 110] [--threshold 0.90]
//                         [--inpage-fonts fonts/inpage-local] [--out tmp/pdfs/visual-diff]
//                         [--nooric] (experimental NOORIC record shaping)

import { diffCase } from "./visual-diff.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const caseName = argumentValue("--case") ?? "A3 sample";
const dpi = Number(argumentValue("--dpi") ?? "36");
const previewDpi = argumentValue("--preview-dpi");
const threshold = argumentValue("--threshold");
const inpageFonts = argumentValue("--inpage-fonts");
const outDir = argumentValue("--out");

const result = await diffCase(caseName, {
  dpi,
  ...(previewDpi ? { previewDpi: Number(previewDpi) } : {}),
  ...(inpageFonts ? { inpageFonts } : {}),
  ...(outDir ? { outDir } : {}),
  ...(process.argv.includes("--nooric") ? { nooric: true } : {}),
});
for (const page of result.pages) {
  console.log(`${result.name} page ${page.page}: ${(page.overlap * 100).toFixed(2)}%`);
  console.log(`  comparison: ${page.comparisonPng}`);
}
console.log(`average: ${(result.average * 100).toFixed(2)}%`);
if (threshold !== undefined && result.average < Number(threshold)) {
  console.error(`below threshold ${(Number(threshold) * 100).toFixed(2)}%`);
  process.exitCode = 1;
}
