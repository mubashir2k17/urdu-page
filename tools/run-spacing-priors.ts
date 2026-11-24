// CLI entry for offline spacing priors.
//
// Usage:
//   npm run spacing:priors -- [--case "A3 sample"] [--pdf path.pdf] [--out tmp/pdfs/spacing-priors]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { REFERENCE_CASES } from "../tests/reference-manifest.js";
import { extractSpacingPriors, toRendererSpacingPriors } from "./spacing-priors.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const caseName = argumentValue("--case") ?? "A3 sample";
const explicitPdf = argumentValue("--pdf");
const reference = REFERENCE_CASES.find((candidate) => candidate.name === caseName);
if (!explicitPdf && !reference) {
  throw new Error(`Unknown case "${caseName}". Known: ${REFERENCE_CASES.map((c) => c.name).join(", ")}`);
}
const pdfPath = resolve(explicitPdf ?? reference!.referencePdf);
const outDir = resolve(argumentValue("--out") ?? "tmp/pdfs/spacing-priors");
mkdirSync(outDir, {recursive: true});

const priors = await extractSpacingPriors(pdfPath);
const {tc, tw, tj} = priors.overall;
console.log(
  `${caseName}: Tc count ${tc.count} median ${tc.median}, ` +
    `Tw count ${tw.count} median ${tw.median}, ` +
    `TJ count ${tj.count} median ${tj.median} p95|x| ${tj.p95Abs}`,
);
const slug = caseName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
const output = join(outDir, `${slug}.json`);
writeFileSync(output, `${JSON.stringify(priors, null, 2)}\n`, "utf8");
const rendererOutput = join(outDir, `${slug}-renderer.json`);
writeFileSync(rendererOutput, `${JSON.stringify(toRendererSpacingPriors(priors), null, 2)}\n`, "utf8");
console.log(`Wrote ${output}`);
console.log(`Wrote ${rendererOutput} (pass as RenderTypography.spacingPriors)`);
