import type { ShapedGlyph } from "@inpage/text-shaper";

/**
 * Shared pen arithmetic for measuring and drawing shaped runs.
 *
 * A glyph is placed at the current pen plus its font offset, scaled by the
 * appearance horizontal scale. The pen then advances by the glyph's stored
 * advance, which horizontal scaling intentionally does not modify (the scale
 * stretches positions, not the advance the next origin is derived from),
 * matching the native printer.
 */
export interface RunMetricSource {
  unitsPerEm: number;
  fontSizeScale?: number;
}

export interface PenState {
  x: number;
  y: number;
}

export interface GlyphOrigin {
  x: number;
  y: number;
}

/** Scale from run font units to points at the given drawing size. */
export function runScale(run: RunMetricSource, size: number): number {
  return (size * (run.fontSizeScale ?? 1)) / run.unitsPerEm;
}

/**
 * Natural horizontal advance of a run in points, before appearance-level
 * horizontal scaling. Summing the glyph advances (rather than trusting
 * `run.totalAdvance`) keeps measurement consistent with edits made during
 * spacing distribution.
 */
export function advanceRun(
  run: RunMetricSource & { glyphs: readonly Pick<ShapedGlyph, "xAdvance">[] },
  size: number,
): number {
  const scale = runScale(run, size);
  let advance = 0;
  for (const glyph of run.glyphs) advance += glyph.xAdvance * scale;
  return advance;
}

/**
 * Origin of the next glyph and the pen state after advancing past it.
 * `horizontalScale` applies to the origin only.
 */
export function stepGlyph(
  glyph: Pick<ShapedGlyph, "xAdvance" | "yAdvance" | "xOffset" | "yOffset">,
  pen: PenState,
  scale: number,
  horizontalScale: number,
): { origin: GlyphOrigin; next: PenState } {
  return {
    origin: {
      x: (pen.x + glyph.xOffset * scale) * horizontalScale,
      y: pen.y + glyph.yOffset * scale,
    },
    next: {
      x: pen.x + glyph.xAdvance * scale,
      y: pen.y + glyph.yAdvance * scale,
    },
  };
}
