import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { NodeFallbackFont } from "@inpage/pdf-renderer";

import { auditReferenceCase, renderCurrentPdf } from "../tests/reference-harness.js";
import { REFERENCE_CASES } from "../tests/reference-manifest.js";

interface RasterComparison {
  page: number;
  status: "compared" | "missing-generated-page" | "both-blank";
  inkSimilarity?: number;
}

const outputDirectory = join(process.cwd(), "tmp", "pdfs", "reference-audit");
mkdirSync(outputDirectory, { recursive: true });
const fontPath = argumentValue("--font");
const fallbackFont = fontPath
  ? new NodeFallbackFont(async () => new Uint8Array(readFileSync(resolve(fontPath))))
  : undefined;

const reports = [];
const caseFilter = argumentValue("--case")?.toLowerCase();

for (const referenceCase of REFERENCE_CASES.filter((candidate) =>
  caseFilter ? candidate.name.toLowerCase().includes(caseFilter) : true,
)) {
  const current = await renderCurrentPdf(referenceCase, fallbackFont);
  const audit = await auditReferenceCase(referenceCase, current);
  const slug = basename(referenceCase.input).replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const generatedPdf = join(outputDirectory, `${slug}-current.pdf`);
  writeFileSync(generatedPdf, current.bytes);

  const referenceTextCharacters = extractPdfText(referenceCase.referencePdf).length;
  const generatedTextCharacters = extractPdfText(generatedPdf).length;
  const rasters = referenceCase.samplePages.map((page) =>
    compareRasterPage(
      referenceCase.referencePdf,
      generatedPdf,
      page,
      audit.generated.pageCount,
      join(outputDirectory, `${slug}-page-${page}`),
    ),
  );

  reports.push({
    ...audit,
    input: referenceCase.input,
    referencePdf: referenceCase.referencePdf,
    generatedPdf,
    pdfText: {
      referenceCharacters: referenceTextCharacters,
      generatedCharacters: generatedTextCharacters,
    },
    rasters,
  });
}

const reportPath = join(outputDirectory, "report.json");
writeFileSync(reportPath, `${JSON.stringify(reports, null, 2)}\n`, "utf8");

console.table(
  reports.map((report) => ({
    document: report.name,
    pages: `${report.generated.pageCount}/${report.reference.pageCount}`,
    pageSize: report.comparisons.firstPageSizeMatches ? "match" : "mismatch",
    sourceText: report.extractedCharacters,
    pdfText: `${report.pdfText.generatedCharacters}/${report.pdfText.referenceCharacters}`,
    visual: summarizeVisual(report.rasters),
  })),
);
console.log(`Reference audit written to ${reportPath}`);

if (process.argv.includes("--strict")) {
  const incompatible = reports.some(
    (report) =>
      !report.comparisons.pageCountMatches ||
      !report.comparisons.firstPageSizeMatches ||
      report.rasters.some(
        (raster) => raster.status !== "compared" || (raster.inkSimilarity ?? 0) < 0.98,
      ),
  );
  if (incompatible) process.exitCode = 1;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a file path`);
  }
  return value;
}

function extractPdfText(path: string): string {
  const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
  return text.replace(/\s+/g, "").trim();
}

function compareRasterPage(
  referencePdf: string,
  generatedPdf: string,
  page: number,
  generatedPageCount: number,
  outputPrefix: string,
): RasterComparison {
  if (page > generatedPageCount) return { page, status: "missing-generated-page" };

  const referencePrefix = `${outputPrefix}-reference`;
  const generatedPrefix = `${outputPrefix}-current`;
  renderGrayPage(referencePdf, page, referencePrefix);
  renderGrayPage(generatedPdf, page, generatedPrefix);

  const reference = readPgm(`${referencePrefix}.pgm`);
  const generated = readPgm(`${generatedPrefix}.pgm`);
  const generatedPixels =
    reference.width === generated.width && reference.height === generated.height
      ? generated.pixels
      : resizeNearest(
          generated.pixels,
          generated.width,
          generated.height,
          reference.width,
          reference.height,
        );

  let intersection = 0;
  let union = 0;
  for (let i = 0; i < reference.pixels.length; i++) {
    const referenceInk = 255 - reference.pixels[i]!;
    const generatedInk = 255 - generatedPixels[i]!;
    intersection += Math.min(referenceInk, generatedInk);
    union += Math.max(referenceInk, generatedInk);
  }

  if (union === 0) return { page, status: "both-blank" };
  return {
    page,
    status: "compared",
    inkSimilarity: intersection / union,
  };
}

function renderGrayPage(pdf: string, page: number, prefix: string): void {
  execFileSync("pdftoppm", [
    "-f",
    String(page),
    "-l",
    String(page),
    "-singlefile",
    "-r",
    "36",
    "-gray",
    pdf,
    prefix,
  ]);
}

function readPgm(path: string): { width: number; height: number; pixels: Uint8Array } {
  const bytes = readFileSync(path);
  let offset = 0;

  function token(): string {
    while (offset < bytes.length) {
      const byte = bytes[offset]!;
      if (byte === 0x23) {
        while (offset < bytes.length && bytes[offset] !== 0x0a) offset++;
      } else if (byte <= 0x20) {
        offset++;
      } else {
        break;
      }
    }
    const start = offset;
    while (offset < bytes.length && bytes[offset]! > 0x20) offset++;
    return bytes.subarray(start, offset).toString("ascii");
  }

  if (token() !== "P5") throw new Error(`Unsupported raster format in ${path}`);
  const width = Number(token());
  const height = Number(token());
  const maximum = Number(token());
  if (maximum !== 255) throw new Error(`Unsupported PGM depth ${maximum} in ${path}`);
  while (offset < bytes.length && bytes[offset]! <= 0x20) offset++;

  const pixels = bytes.subarray(offset);
  if (pixels.length !== width * height) {
    throw new Error(`Invalid PGM payload in ${path}: ${pixels.length} bytes for ${width}x${height}`);
  }
  return { width, height, pixels };
}

function resizeNearest(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  const target = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetWidth));
      target[y * targetWidth + x] = source[sourceY * sourceWidth + sourceX]!;
    }
  }
  return target;
}

function summarizeVisual(rasters: RasterComparison[]): string {
  const compared = rasters.filter(
    (raster): raster is RasterComparison & { inkSimilarity: number } =>
      raster.status === "compared" && raster.inkSimilarity !== undefined,
  );
  if (compared.length === 0) return "not comparable";
  const average = compared.reduce((total, raster) => total + raster.inkSimilarity, 0) / compared.length;
  return `${(average * 100).toFixed(1)}% ink overlap`;
}
