import { describe, expect, it } from "vitest";

import {
  compareReadingOrder,
  crossCorrelationLag,
  gapHistogram,
  groupIntoLines,
  type Box,
} from "../tools/spacing-metrics.js";

function box(x: number, y: number, width = 8, height = 10): Box {
  return {x, y, width, height};
}

describe("spacing metrics", () => {
  it("groups boxes into baseline lines and sorts each line by x", () => {
    const lines = groupIntoLines([
      box(30, 100),
      box(10, 101),
      box(50, 40),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.map((entry) => entry.x))).toEqual([[50], [10, 30]]);
  });

  it("aligns glyphs in reading order and reports systematic dx, drift and gaps", () => {
    const reference = [box(0, 100), box(20, 100), box(40, 100)];
    const generated = [box(0.5, 100), box(20.5, 100), box(41.5, 100)];
    const [line] = compareReadingOrder(reference, generated);
    expect(line!.glyphCount).toBe(3);
    expect(line!.deltas).toEqual([0.5, 0.5, 1.5]);
    expect(line!.drift).toBeCloseTo(1, 6);
    expect(line!.referenceGaps).toEqual([12, 12]);
    expect(line!.generatedGaps).toEqual([12, 13]);
  });

  it("reports zero earth-mover distance for identical gap distributions", () => {
    const same = gapHistogram([2, 3, 2.5], [2, 3, 2.5]);
    expect(same.earthMover).toBeCloseTo(0, 8);
    const shifted = gapHistogram([2, 3, 2.5], [2.5, 3.5, 3]);
    expect(shifted.earthMover).toBeGreaterThan(0);
  });

  it("recovers a known projection lag", () => {
    const reference = new Float64Array(60);
    for (let index = 0; index < 20; index++) reference[10 + index] = 100 - index;
    const generated = new Float64Array(60);
    for (let index = 0; index < 20; index++) generated[13 + index] = 100 - index;
    const result = crossCorrelationLag(reference, generated, 10);
    expect(result.lag).toBe(3);
    expect(result.correlation).toBeGreaterThan(0.99);
  });
});
