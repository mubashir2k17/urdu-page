// Rasterise exported probe PDFs to the binary PGM the oracle measures.
//
// Usage:
//   npm run spacing:rasterize -- --dir tmp/reverse-engineering/spacing-probes --dpi 300

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { findPoppler } from "./visual-diff.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const directory = resolve(argumentValue("--dir") ?? "tmp/reverse-engineering/spacing-probes");
const dpi = Number(argumentValue("--dpi") ?? "300");
if (!Number.isFinite(dpi) || dpi <= 0) throw new Error("--dpi must be positive");
const pdftoppm = findPoppler("pdftoppm");

const pdfs = readdirSync(directory).filter((file) => extname(file).toLowerCase() === ".pdf");
if (pdfs.length === 0) throw new Error(`No PDFs found in ${directory}`);

for (const file of pdfs) {
  const pdf = join(directory, file);
  const prefix = join(directory, basename(file, extname(file)));
  execFileSync(pdftoppm, [
    "-f", "1", "-l", "1", "-singlefile", "-r", String(dpi), "-gray", pdf, prefix,
  ], {stdio: "ignore"});
  console.log(`${file} -> ${basename(prefix)}.pgm (${dpi} dpi)`);
}
console.log(`Rasterised ${pdfs.length} probe PDF(s) in ${directory}`);
