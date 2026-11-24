// Glyph-origin spacing diff.
//
// Renders reference and generated PDFs to SVG, matches glyph boxes in reading
// order (baseline grouping + x sorting), and reports per-glyph dx, per-line
// drift, inter-word-gap histograms, and a high-resolution 1-D projection lag
// per line. Catches 0.1–0.5 pt interior drift the 36-dpi raster gate cannot.
//
// Usage:
//   npm run spacing:diff -- [--case "A3 sample"] [--inpage-fonts fonts/inpage-local]
//                           [--out tmp/pdfs/spacing-diff] [--dpi 150] [--max-lag 12]

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { renderCurrentPdf } from "../tests/reference-harness.js";
import { REFERENCE_CASES } from "../tests/reference-manifest.js";
import { loadInPageTypography } from "./inpage-fonts.js";
import { encodePng } from "./png.js";
import {
  comparePageOrigins,
  crossCorrelationLag,
  groupIntoLines,
  type Box,
  type GapHistogram,
  type LineOriginDiff,
  type OriginMetrics,
} from "./spacing-metrics.js";
import { parseSvgGlyphBoxes } from "./vector-diff.js";
import { findPoppler, readPgm, slug, type GrayImage } from "./visual-diff.js";

export interface LineProjection {
  baselinePt: number;
  /** Peak-correlation lag in pixels (positive = generated shifted right). */
  lagPx: number;
  /** Peak-correlation lag converted to points. */
  lagPt: number;
  correlation: number;
  peakWidthPx: number;
}

export interface PageSpacingDiff {
  page: number;
  referenceSvg: string;
  generatedSvg: string;
  metrics: OriginMetrics;
  histogram: GapHistogram;
  lines: LineOriginDiff[];
  projections: LineProjection[];
  lagPlotPng: string;
}

export interface CaseSpacingDiff {
  name: string;
  pages: PageSpacingDiff[];
}

export interface SpacingDiffOptions {
  outDir?: string;
  inpageFonts?: string;
  nooric?: boolean;
  /** Raster resolution for the 1-D projection check. */
  dpi?: number;
  /** Maximum correlation lag searched, in points. */
  maxLagPoints?: number;
}

function renderSvg(pdf: string, page: number, output: string): void {
  execFileSync(findPoppler("pdftocairo"), [
    "-svg", "-f", String(page), "-l", String(page), pdf, output,
  ], {stdio: "ignore"});
}

function renderGray(pdf: string, page: number, prefix: string, dpi: number): void {
  execFileSync(findPoppler("pdftoppm"), [
    "-f", String(page), "-l", String(page), "-singlefile", "-r", String(dpi), "-gray", pdf, prefix,
  ]);
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
  return {width, height, pixels};
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

/** Horizontal ink projection over a pixel row band. */
function projection(image: GrayImage, top: number, bottom: number): Float64Array {
  const start = clamp(Math.floor(top), 0, image.height - 1);
  const end = clamp(Math.ceil(bottom), start + 1, image.height);
  const out = new Float64Array(image.width);
  for (let y = start; y < end; y++) {
    const row = y * image.width;
    for (let x = 0; x < image.width; x++) out[x] = out[x]! + (255 - image.pixels[row + x]!);
  }
  return out;
}

function lineBands(boxes: readonly Box[]): {baseline: number; top: number; bottom: number}[] {
  return groupIntoLines(boxes).map((line) => {
    const baseline = Math.max(...line.map((box) => box.y + box.height));
    return {
      baseline,
      top: Math.min(...line.map((box) => box.y)),
      bottom: Math.max(...line.map((box) => box.y + box.height)),
    };
  });
}

/**
 * Per-line lag plot: one row per line, a dot at the correlation peak. White is
 * zero lag; the centre column marks the neutral axis.
 */
function buildLagPlot(projections: readonly LineProjection[], maxLagPx: number): Buffer {
  const scale = 4;
  const width = Math.max(1, (2 * maxLagPx + 1) * scale);
  const rowHeight = 4;
  const height = Math.max(1, projections.length * rowHeight);
  const rgb = new Uint8Array(width * height * 3).fill(255);
  const neutral = maxLagPx * scale;
  for (let y = 0; y < height; y++) {
    for (let x = neutral; x < neutral + scale; x++) {
      const base = (y * width + x) * 3;
      rgb[base] = 200; rgb[base + 1] = 200; rgb[base + 2] = 200;
    }
  }
  projections.forEach((line, index) => {
    const x = clamp((line.lagPx + maxLagPx) * scale, 0, width - 1);
    const shade = Math.round(255 - clamp(line.correlation, 0, 1) * 255);
    for (let dy = 0; dy < rowHeight - 1; dy++) {
      const base = ((index * rowHeight + dy) * width + x) * 3;
      rgb[base] = shade; rgb[base + 1] = shade; rgb[base + 2] = shade;
    }
  });
  return encodePng(width, height, rgb);
}

export async function spacingDiffCase(
  caseName: string,
  options: SpacingDiffOptions = {},
): Promise<CaseSpacingDiff> {
  const referenceCase = REFERENCE_CASES.find((candidate) => candidate.name === caseName);
  if (!referenceCase) {
    throw new Error(`Unknown case "${caseName}". Known: ${REFERENCE_CASES.map((c) => c.name).join(", ")}`);
  }
  const dpi = options.dpi ?? 150;
  const maxLagPoints = options.maxLagPoints ?? 12;
  const maxLagPx = Math.max(1, Math.ceil((maxLagPoints * dpi) / 72));
  const outDir = resolve(options.outDir ?? "tmp/pdfs/spacing-diff");
  mkdirSync(outDir, {recursive: true});

  const typography = options.inpageFonts
    ? loadInPageTypography(resolve(options.inpageFonts), {...(options.nooric ? {nooric: true} : {})})
    : undefined;
  const generated = await renderCurrentPdf(referenceCase, undefined, typography);
  const generatedPdf = join(outDir, `${slug(caseName)}-current.pdf`);
  writeFileSync(generatedPdf, generated.bytes);

  const pages: PageSpacingDiff[] = [];
  for (const page of referenceCase.samplePages) {
    const base = join(outDir, `${slug(caseName)}-page-${page}`);
    const referenceSvg = `${base}-reference.svg`;
    const generatedSvg = `${base}-generated.svg`;
    renderSvg(referenceCase.referencePdf, page, referenceSvg);
    renderSvg(generatedPdf, page, generatedSvg);

    const referenceBoxes = parseSvgGlyphBoxes(readFileSync(referenceSvg, "utf8"));
    const generatedBoxes = parseSvgGlyphBoxes(readFileSync(generatedSvg, "utf8"));
    const origins = comparePageOrigins(referenceBoxes, generatedBoxes);

    renderGray(referenceCase.referencePdf, page, `${base}-reference`, dpi);
    renderGray(generatedPdf, page, `${base}-generated`, dpi);
    const referenceImage = readPgm(`${base}-reference.pgm`);
    const generatedImage = resizeNearest(
      readPgm(`${base}-generated.pgm`),
      referenceImage.width,
      referenceImage.height,
    );

    const projections: LineProjection[] = [];
    for (const band of lineBands(referenceBoxes)) {
      if (projections.length >= 80) break;
      const top = (band.top * dpi) / 72;
      const bottom = (band.bottom * dpi) / 72;
      if (bottom - top < 1) continue;
      const result = crossCorrelationLag(
        projection(referenceImage, top, bottom),
        projection(generatedImage, top, bottom),
        maxLagPx,
      );
      projections.push({
        baselinePt: band.baseline,
        lagPx: result.lag,
        lagPt: (result.lag * 72) / dpi,
        correlation: result.correlation,
        peakWidthPx: result.width,
      });
    }

    const lagPlotPng = `${base}-lag.png`;
    writeFileSync(lagPlotPng, buildLagPlot(projections, maxLagPx));

    pages.push({
      page,
      referenceSvg,
      generatedSvg,
      metrics: origins.metrics,
      histogram: origins.histogram,
      lines: origins.lines,
      projections,
      lagPlotPng,
    });
  }
  return {name: caseName, pages};
}
