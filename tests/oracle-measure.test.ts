import { describe, expect, it } from "vitest";

import { measureGlyphAdvances, parsePgm, segmentInkColumns } from "../tools/oracle-measure.js";

function pgm(width: number, height: number, ink: (x: number, y: number) => boolean): Uint8Array {
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii");
  const pixels = new Uint8Array(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ink(x, y)) pixels[y * width + x] = 0;
    }
  }
  return new Uint8Array([...header, ...pixels]);
}

describe("oracle raster measurement", () => {
  it("parses binary PGM and segments separated glyph columns", () => {
    const image = parsePgm(pgm(20, 4, (x) => (x >= 2 && x <= 4) || (x >= 8 && x <= 10) || (x >= 15 && x <= 17)));
    const measurement = measureGlyphAdvances(image);
    expect(measurement.intervals.map(({ start, end }) => [start, end])).toEqual([[2, 5], [8, 11], [15, 18]]);
    expect(measurement.advances).toEqual([6, 7]);
    expect(measurement.widths).toEqual([3, 3, 3]);
  });

  it("honours the ink threshold and horizontal band", () => {
    const image = parsePgm(pgm(10, 10, (x, y) => x === 3 && y >= 5));
    expect(segmentInkColumns(image, { threshold: 1 }).length).toBe(1);
    expect(segmentInkColumns(image, { threshold: 1, yMax: 4 }).length).toBe(0);
    expect(segmentInkColumns(image, { threshold: 1, yMin: 5 }).length).toBe(1);
  });

  it("rejects malformed rasters", () => {
    expect(() => parsePgm(new Uint8Array([0x50, 0x32]))).toThrow(/PGM/);
    expect(() => parsePgm(Buffer.from("P5\n2 2\n255\n\x00", "binary"))).toThrow(/Truncated/);
  });
});
