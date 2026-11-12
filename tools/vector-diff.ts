// Vector-level PDF diff: Poppler emits one SVG path per filled/stroked glyph
// outline. Comparing path bounding boxes catches per-glyph advance and offset
// drift that the aggregate 36-dpi raster score hides.
//
// Usage:
//   npm run vector:diff -- [--case "A3 sample"] [--inpage-fonts fonts/inpage-local]
//                         [--out tmp/pdfs/vector-diff] [--tolerance 2] [--nooric]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { renderCurrentPdf } from "../tests/reference-harness.js";
import { REFERENCE_CASES } from "../tests/reference-manifest.js";
import { loadInPageTypography } from "./inpage-fonts.js";

export interface VectorBox {
  x: number;
  y: number;
  width: number;
  height: number;
  points: number;
}

export interface VectorComparison {
  referenceCount: number;
  generatedCount: number;
  matched: number;
  /** Matched / max(reference, generated), in [0, 1]. */
  matchRate: number;
  meanCenterDelta: number;
  meanSizeDelta: number;
  unmatchedReference: number;
  unmatchedGenerated: number;
}

export interface PageVectorDiff extends VectorComparison {
  page: number;
  referenceSvg: string;
  generatedSvg: string;
}

export interface CaseVectorDiff {
  name: string;
  pages: readonly PageVectorDiff[];
  averageMatchRate: number;
}

const COMMAND = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;

/** Compute the bounding box of one SVG path's coordinates. */
export function parsePathBox(data: string): VectorBox | undefined {
  const tokens: { command?: string; value?: number }[] = [];
  for (const match of data.matchAll(COMMAND)) {
    if (match[1]) tokens.push({ command: match[1] });
    else if (match[2]) tokens.push({ value: Number(match[2]) });
  }
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (px: number, py: number): void => {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  };
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (!token.command) {
      index++;
      continue;
    }
    const command = token.command;
    const relative = command === command.toLowerCase();
    const kind = command.toUpperCase();
    const read = (count: number): number[] => {
      const values: number[] = [];
      while (values.length < count && index < tokens.length && tokens[index]!.value !== undefined) {
        values.push(tokens[index++]!.value!);
      }
      return values;
    };
    const add = (dx: number, dy: number): void => {
      x = relative ? x + dx : dx;
      y = relative ? y + dy : dy;
      include(x, y);
    };
    if (kind === "Z") {
      x = startX;
      y = startY;
      index++;
      continue;
    }
    index++;
    if (kind === "M" || kind === "L" || kind === "T") {
      let first = true;
      for (;;) {
        const pair = read(2);
        if (pair.length < 2) break;
        add(pair[0]!, pair[1]!);
        if (first) {
          startX = x;
          startY = y;
          first = false;
        }
      }
    } else if (kind === "H") {
      for (;;) {
        const value = read(1);
        if (value.length < 1) break;
        x = relative ? x + value[0]! : value[0]!;
        include(x, y);
      }
    } else if (kind === "V") {
      for (;;) {
        const value = read(1);
        if (value.length < 1) break;
        y = relative ? y + value[0]! : value[0]!;
        include(x, y);
      }
    } else if (kind === "C") {
      for (;;) {
        const values = read(6);
        if (values.length < 6) break;
        add(values[0]!, values[1]!);
        add(values[2]!, values[3]!);
        add(values[4]!, values[5]!);
      }
    } else if (kind === "S" || kind === "Q") {
      for (;;) {
        const values = read(4);
        if (values.length < 4) break;
        add(values[0]!, values[1]!);
        add(values[2]!, values[3]!);
      }
    } else if (kind === "A") {
      for (;;) {
        const values = read(7);
        if (values.length < 7) break;
        add(values[5]!, values[6]!);
      }
    } else {
      break;
    }
  }
  if (!Number.isFinite(minX)) return undefined;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width === 0 || height === 0) return undefined;
  return { x: minX, y: minY, width, height, points: tokens.length };
}

export function parseSvgPathBoxes(svg: string): VectorBox[] {
  const boxes: VectorBox[] = [];
  for (const match of svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)) {
    const box = parsePathBox(match[1]!);
    if (box && box.width > 0 && box.height > 0) boxes.push(box);
  }
  return boxes;
}

interface Matrix { a:number; b:number; c:number; d:number; e:number; f:number }

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

/** Parse the matrix/translate/scale forms Poppler emits for glyph placement. */
export function parseTransform(value: string | undefined): Matrix {
  let result: Matrix = { a:1, b:0, c:0, d:1, e:0, f:0 };
  if (!value) return result;
  for (const match of value.matchAll(/(matrix|translate|scale)\s*\(([^)]*)\)/g)) {
    const values = match[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let next: Matrix;
    if (match[1] === "matrix" && values.length >= 6) {
      next = { a:values[0]!, b:values[1]!, c:values[2]!, d:values[3]!, e:values[4]!, f:values[5]! };
    } else if (match[1] === "translate" && values.length >= 1) {
      next = { a:1, b:0, c:0, d:1, e:values[0]!, f:values[1] ?? 0 };
    } else if (match[1] === "scale" && values.length >= 1) {
      next = { a:values[0]!, b:0, c:0, d:values[1] ?? values[0]!, e:0, f:0 };
    } else {
      continue;
    }
    result = multiply(result, next);
  }
  return result;
}

function transformBox(box: VectorBox, matrix: Matrix): VectorBox {
  const points = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ].map(([x, y]) => ({
    x: matrix.a * x! + matrix.c * y! + matrix.e,
    y: matrix.b * x! + matrix.d * y! + matrix.f,
  }));
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
    points: box.points,
  };
}

/**
 * Resolve Poppler's `<g id="glyph...">` definitions through each `<use>`
 * transform. This is the per-glyph page-space box needed to compare advances
 * and offsets; `parseSvgPathBoxes` only sees unplaced outline shapes.
 */
export function parseSvgGlyphBoxes(svg: string): VectorBox[] {
  const definitions = new Map<string, VectorBox>();
  for (const match of svg.matchAll(/<g id="([^"]+)">([\s\S]*?)<\/g>/g)) {
    const id = match[1]!;
    const paths = [...match[2]!.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)]
      .map(path => parsePathBox(path[1]!))
      .filter((box): box is VectorBox => !!box);
    if (paths.length === 0) continue;
    const minX = Math.min(...paths.map(box => box.x));
    const minY = Math.min(...paths.map(box => box.y));
    const maxX = Math.max(...paths.map(box => box.x + box.width));
    const maxY = Math.max(...paths.map(box => box.y + box.height));
    definitions.set(id, { x:minX, y:minY, width:maxX-minX, height:maxY-minY, points:paths.length });
  }
  const boxes: VectorBox[] = [];
  for (const match of svg.matchAll(/<use\b([^>]*)\/?>/g)) {
    const attributes = match[1]!;
    const href = /(?:xlink:)?href="#([^"]+)"/.exec(attributes)?.[1];
    if (!href) continue;
    const box = definitions.get(href);
    if (!box) continue;
    const x = Number(/\bx="([^"]+)"/.exec(attributes)?.[1] ?? 0);
    const y = Number(/\by="([^"]+)"/.exec(attributes)?.[1] ?? 0);
    let matrix: Matrix = { a:1, b:0, c:0, d:1, e:x, f:y };
    const transform = /transform="([^"]*)"/.exec(attributes)?.[1];
    if (transform) matrix = multiply(matrix, parseTransform(transform));
    const placed = transformBox(box, matrix);
    if (placed.width > 0 && placed.height > 0) boxes.push(placed);
  }
  return boxes;
}

function center(box: VectorBox): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Greedy nearest-centre matching. Reference and generated paths are generic
 * outlines, so identity is unavailable; a tolerance in page points is the
 * honest comparison unit.
 */
export function compareVectorBoxes(
  reference: readonly VectorBox[],
  generated: readonly VectorBox[],
  tolerance = 2,
): VectorComparison {
  const remaining = new Set(generated.map((_, index) => index));
  let matched = 0;
  let centerTotal = 0;
  let sizeTotal = 0;
  for (const referenceBox of reference) {
    const referenceCenter = center(referenceBox);
    let best = -1;
    let bestDistance = Infinity;
    for (const index of remaining) {
      const candidate = generated[index]!;
      const candidateCenter = center(candidate);
      const distance = Math.hypot(candidateCenter.x - referenceCenter.x, candidateCenter.y - referenceCenter.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    if (best >= 0 && bestDistance <= tolerance) {
      remaining.delete(best);
      matched++;
      centerTotal += bestDistance;
      const candidate = generated[best]!;
      sizeTotal += Math.abs(candidate.width - referenceBox.width) + Math.abs(candidate.height - referenceBox.height);
    }
  }
  const denominator = Math.max(1, Math.max(reference.length, generated.length));
  return {
    referenceCount: reference.length,
    generatedCount: generated.length,
    matched,
    matchRate: matched / denominator,
    meanCenterDelta: matched ? centerTotal / matched : 0,
    meanSizeDelta: matched ? sizeTotal / matched : 0,
    unmatchedReference: reference.length - matched,
    unmatchedGenerated: generated.length - matched,
  };
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

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function renderSvg(pdf: string, page: number, output: string): void {
  execFileSync(findPoppler("pdftocairo"), [
    "-svg", "-f", String(page), "-l", String(page), pdf, output,
  ], { stdio: "ignore" });
}

export interface VectorDiffOptions {
  outDir?: string;
  inpageFonts?: string;
  nooric?: boolean;
  tolerance?: number;
}

export async function vectorDiffCase(
  caseName: string,
  options: VectorDiffOptions = {},
): Promise<CaseVectorDiff> {
  const referenceCase = REFERENCE_CASES.find((candidate) => candidate.name === caseName);
  if (!referenceCase) {
    throw new Error(`Unknown case "${caseName}". Known: ${REFERENCE_CASES.map((c) => c.name).join(", ")}`);
  }
  const outDir = resolve(options.outDir ?? "tmp/pdfs/vector-diff");
  mkdirSync(outDir, { recursive: true });
  const typography = options.inpageFonts
    ? loadInPageTypography(resolve(options.inpageFonts), {...(options.nooric ? {nooric: true} : {})})
    : undefined;
  const generated = await renderCurrentPdf(referenceCase, undefined, typography);
  const generatedPdf = join(outDir, `${slug(caseName)}-current.pdf`);
  writeFileSync(generatedPdf, generated.bytes);

  const pages: PageVectorDiff[] = [];
  for (const page of referenceCase.samplePages) {
    const referenceSvgPath = join(outDir, `${slug(caseName)}-page-${page}-reference.svg`);
    const generatedSvgPath = join(outDir, `${slug(caseName)}-page-${page}-generated.svg`);
    renderSvg(referenceCase.referencePdf, page, referenceSvgPath);
    renderSvg(generatedPdf, page, generatedSvgPath);
    const referenceBoxes = parseSvgGlyphBoxes(readFileSync(referenceSvgPath, "utf8"));
    const generatedBoxes = parseSvgGlyphBoxes(readFileSync(generatedSvgPath, "utf8"));
    pages.push({
      page,
      referenceSvg: referenceSvgPath,
      generatedSvg: generatedSvgPath,
      ...compareVectorBoxes(referenceBoxes, generatedBoxes, options.tolerance ?? 2),
    });
  }
  const averageMatchRate = pages.reduce((sum, entry) => sum + entry.matchRate, 0) / Math.max(1, pages.length);
  return { name: caseName, pages, averageMatchRate };
}

