// Pen-trace harness for spacing fidelity.
//
// Drives the styled layout through a recording PdfBackend and rebuilds the pen
// after every glyph from the same model the real backend uses. This runs in
// the fast suite (no Poppler, no reference PDFs) and is sensitive to the
// 0.1–0.5 pt measure/draw disagreements the 36-dpi raster gate cannot see.

import type { ShapedRun } from "@inpage/text-shaper";
import {
  advanceRun,
  runScale,
  stepGlyph,
  type PdfBackend,
  type TextAppearance,
} from "@inpage/pdf-renderer";

export interface DrawCall {
  run: ShapedRun;
  x: number;
  y: number;
  size: number;
  rotation: number;
  appearance: TextAppearance;
}

export interface TracedGlyph {
  /** Along-baseline origin (rotation not applied), in points. */
  x: number;
  y: number;
  advance: number;
}

export interface TracedRun extends DrawCall {
  glyphs: TracedGlyph[];
  /** Along-baseline start/end of this run's pen, in points. */
  start: number;
  end: number;
}

/** Recording backend: same measure arithmetic as the PDF backend. */
export class RecordingBackend implements PdfBackend {
  readonly calls: DrawCall[] = [];
  readonly pages: {width: number; height: number}[] = [];

  addPage(width: number, height: number): void {
    this.pages.push({width, height});
  }

  measureShapedRun(run: ShapedRun, size: number): number {
    return advanceRun(run, size);
  }

  drawShapedRun(
    run: ShapedRun,
    x: number,
    y: number,
    size: number,
    rotationDegrees = 0,
    appearance: TextAppearance = {},
  ): void {
    this.calls.push({run, x, y, size, rotation: rotationDegrees, appearance});
  }

  async drawImage(): Promise<void> {}

  drawLine(): void {}

  drawRectangle(): void {}

  async save(): Promise<Uint8Array> {
    return new Uint8Array();
  }
}

/** Reconstruct the pen for one recorded draw call. */
export function traceRun(call: DrawCall): TracedRun {
  const scale = runScale(call.run, call.size);
  const horizontalScale = call.appearance.horizontalScale ?? 1;
  let pen = {x: 0, y: 0};
  const glyphs: TracedGlyph[] = [];
  for (const glyph of call.run.glyphs) {
    const {origin, next} = stepGlyph(glyph, pen, scale, horizontalScale);
    glyphs.push({
      x: call.x + origin.x,
      y: call.y + origin.y,
      advance: (next.x - pen.x) * horizontalScale,
    });
    pen = next;
  }
  return {
    ...call,
    glyphs,
    start: call.x,
    end: call.x + pen.x * horizontalScale,
  };
}

export function traceCalls(calls: readonly DrawCall[]): TracedRun[] {
  return calls.map(traceRun);
}

export interface LineExtent {
  start: number;
  end: number;
  width: number;
}

/** Smallest start and largest end across a line's runs. */
export function lineExtent(runs: readonly TracedRun[]): LineExtent {
  let start = Infinity;
  let end = -Infinity;
  for (const run of runs) {
    start = Math.min(start, run.start, run.end);
    end = Math.max(end, run.start, run.end);
  }
  if (!Number.isFinite(start)) return {start: 0, end: 0, width: 0};
  return {start, end, width: end - start};
}

/**
 * Gaps between consecutive word runs, in reading-position order. Glue runs are
 * included in the gap (word end to next word start), matching what a reader
 * perceives as the inter-word space.
 */
export function wordGaps(runs: readonly TracedRun[]): number[] {
  const words = runs
    .filter((run) => /\S/.test(run.run.logicalText))
    .sort((left, right) => left.start - right.start);
  const gaps: number[] = [];
  for (let index = 1; index < words.length; index++) {
    gaps.push(words[index]!.start - words[index - 1]!.end);
  }
  return gaps;
}

/** True when consecutive runs abut within `tolerance` (pen continuity). */
export function penIsContinuous(
  runs: readonly TracedRun[],
  tolerance = 1e-6,
): boolean {
  const ordered = [...runs].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index++) {
    if (Math.abs(ordered[index]!.start - ordered[index - 1]!.end) > tolerance) {
      return false;
    }
  }
  return true;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const position = Math.min(ordered.length - 1, Math.max(0, (ordered.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return ordered[lower]!;
  return ordered[lower]! + (ordered[upper]! - ordered[lower]!) * (position - lower);
}
