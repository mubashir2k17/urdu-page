// Visual fidelity harness: rasterize a generated PDF and its reference, compute
// ink overlap at the audit resolution (36 dpi by default), and write per-page
// comparison PNGs (reference | generated | diff; red = reference-only ink,
// blue = generated-only ink, dark = matching ink).
//
// Usage:
//   npm run visual:diff -- [--case "A3 sample"] [--threshold 0.90]
//                         [--dpi 36] [--preview-dpi 110]
//                         [--inpage-fonts fonts/inpage-local] [--out tmp/pdfs/visual-diff]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { PDFDocument } from "pdf-lib";

import { renderCurrentPdf } from "../tests/reference-harness.js";
import { REFERENCE_CASES } from "../tests/reference-manifest.js";
import { loadInPageTypography } from "./inpage-fonts.js";
import { encodePng } from "./png.js";

interface GrayImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface PageDiff {
  page: number;
  overlap: number;
  referencePgm: string;
  generatedPgm: string;
  comparisonPng: string;
}

export interface CaseDiff {
  name: string;
  pages: readonly PageDiff[];
  average: number;
}

interface DiffOptions {
  /** Resolution used for the ink-overlap metric (matches the reference audit). */
  dpi?: number;
  /** Resolution used for the human-readable comparison image. */
  previewDpi?: number;
  outDir?: string;
  inpageFonts?: string;
  /** Opt into experimental NOORIC record shaping for comparison. */
  nooric?: boolean;
}

function readPgm(path: string): GrayImage {
  const bytes = readFileSync(path);
  let offset = 0;
  function token(): string {
    while (offset < bytes.length) {
      const byte = bytes[offset]!;
      if (byte === 0x23) {
        while (offset < bytes.length && bytes[offset] !== 0x0a) offset++;
      } else if (byte <= 0x20) {
        offset++;
      } else break;
    }
    const start = offset;
    while (offset < bytes.length && bytes[offset]! > 0x20) offset++;
    return bytes.subarray(start, offset).toString("ascii");
  }
  if (token() !== "P5") throw new Error(`Unsupported raster format in ${path}`);
  const width = Number(token());
  const height = Number(token());
  const maximum = Number(token());
  if (maximum !== 255) throw new Error(`Unsupported PGM depth ${maximum}`);
  while (offset < bytes.length && bytes[offset]! <= 0x20) offset++;
  const pixels = bytes.subarray(offset);
  if (pixels.length !== width * height) throw new Error(`Invalid PGM payload in ${path}`);
  return { width, height, pixels };
}

function resizeNearest(source: GrayImage, width: number, height: number): GrayImage {
  if (source.width === width && source.height === height) return source;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / height));
    for (let x = 0; x < width; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / width));
      pixels[y * width + x] = source.pixels[sourceY * source.width + sourceX]!;
    }
  }
  return { width, height, pixels };
}

function findPoppler(name: string): string {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const explicit = process.env.POPPLER_BIN;
  if (explicit) {
    const candidate = join(explicit, executable);
    if (existsSync(candidate)) return candidate;
  }
  const packages = join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (existsSync(packages)) {
    for (const directory of readdirSync(packages)) {
      if (!directory.toLowerCase().includes("poppler")) continue;
      const root = join(packages, directory);
      for (const version of readdirSync(root)) {
        const candidate = join(root, version, "Library", "bin", executable);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return name;
}

function renderGray(pdf: string, page: number, prefix: string, dpi: number): void {
  execFileSync(findPoppler("pdftoppm"), [
    "-f", String(page), "-l", String(page), "-singlefile", "-r", String(dpi), "-gray", pdf, prefix,
  ]);
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function inkOverlap(reference: GrayImage, generated: GrayImage): number {
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < reference.pixels.length; index++) {
    const referenceInk = 255 - reference.pixels[index]!;
    const generatedInk = 255 - generated.pixels[index]!;
    intersection += Math.min(referenceInk, generatedInk);
    union += Math.max(referenceInk, generatedInk);
  }
  return union === 0 ? 1 : intersection / union;
}

function buildComparison(reference: GrayImage, generated: GrayImage): Uint8Array {
  const { width, height } = reference;
  const panels = 3;
  const rgb = new Uint8Array(width * panels * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const referenceValue = reference.pixels[index]!;
      const generatedValue = generated.pixels[index]!;
      const referenceInk = 255 - referenceValue;
      const generatedInk = 255 - generatedValue;
      const referenceOnly = Math.max(0, referenceInk - generatedInk);
      const generatedOnly = Math.max(0, generatedInk - referenceInk);
      const shared = Math.min(referenceInk, generatedInk);
      setPixel(rgb, width * panels, x, y, referenceValue, referenceValue, referenceValue);
      setPixel(rgb, width * panels, width + x, y, generatedValue, generatedValue, generatedValue);
      setPixel(
        rgb,
        width * panels,
        width * 2 + x,
        y,
        clamp(255 - generatedOnly - shared),
        clamp(255 - referenceOnly - generatedOnly - shared),
        clamp(255 - referenceOnly - shared),
      );
    }
  }
  return rgb;
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

function setPixel(
  rgb: Uint8Array,
  stridePixels: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
): void {
  const base = (y * stridePixels + x) * 3;
  rgb[base] = r;
  rgb[base + 1] = g;
  rgb[base + 2] = b;
}

export async function diffCase(caseName: string, options: DiffOptions = {}): Promise<CaseDiff> {
  const referenceCase = REFERENCE_CASES.find((candidate) => candidate.name === caseName);
  if (!referenceCase) {
    throw new Error(`Unknown case "${caseName}". Known: ${REFERENCE_CASES.map((c) => c.name).join(", ")}`);
  }
  const metricDpi = options.dpi ?? 36;
  const previewDpi = options.previewDpi ?? Math.max(metricDpi, 110);
  const outDir = resolve(options.outDir ?? "tmp/pdfs/visual-diff");
  mkdirSync(outDir, { recursive: true });
  const typography = options.inpageFonts
    ? loadInPageTypography(resolve(options.inpageFonts),{...(options.nooric?{nooric:true}:{})}) : undefined;
  const generated = await renderCurrentPdf(referenceCase, undefined, typography);

  const generatedPdf = join(outDir, `${slug(caseName)}-current.pdf`);
  writeFileSync(generatedPdf, generated.bytes);
  const pageCount = (await PDFDocument.load(generated.bytes)).getPageCount();

  const pages: PageDiff[] = [];
  for (const page of referenceCase.samplePages) {
    if (page > pageCount) continue;
    const base = join(outDir, `${slug(caseName)}-page-${page}`);

    renderGray(referenceCase.referencePdf, page, `${base}-metric-reference`, metricDpi);
    renderGray(generatedPdf, page, `${base}-metric-generated`, metricDpi);
    const referenceMetric = readPgm(`${base}-metric-reference.pgm`);
    const generatedMetric = resizeNearest(
      readPgm(`${base}-metric-generated.pgm`),
      referenceMetric.width,
      referenceMetric.height,
    );
    const overlap = inkOverlap(referenceMetric, generatedMetric);

    let referencePreview = referenceMetric;
    let generatedPreview = generatedMetric;
    if (previewDpi !== metricDpi) {
      renderGray(referenceCase.referencePdf, page, `${base}-preview-reference`, previewDpi);
      renderGray(generatedPdf, page, `${base}-preview-generated`, previewDpi);
      referencePreview = readPgm(`${base}-preview-reference.pgm`);
      generatedPreview = resizeNearest(
        readPgm(`${base}-preview-generated.pgm`),
        referencePreview.width,
        referencePreview.height,
      );
    }
    const comparisonPng = `${base}-compare.png`;
    writeFileSync(
      comparisonPng,
      encodePng(referencePreview.width * 3, referencePreview.height, buildComparison(referencePreview, generatedPreview)),
    );
    pages.push({
      page,
      overlap,
      referencePgm: `${base}-metric-reference.pgm`,
      generatedPgm: `${base}-metric-generated.pgm`,
      comparisonPng,
    });
  }
  const average = pages.reduce((sum, entry) => sum + entry.overlap, 0) / Math.max(1, pages.length);
  return { name: caseName, pages, average };
}
