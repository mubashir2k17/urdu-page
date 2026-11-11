import { describe, expect, it } from "vitest";

import { computeGraphicBoundary } from "./pdflib-backend.js";
import type { PageObject } from "@inpage/document-model";

function graphic(overrides: Partial<PageObject> = {}): PageObject {
  return {
    kind: "graphic",
    id: 0,
    bounds: { xPoints: 0, yPoints: 0, widthPoints: 0, heightPoints: 0 },
    sourceOffset: 0,
    confidence: "high",
    ...overrides,
  };
}

const RECT_POLY = [
  { x: 36, y: 36 },
  { x: 311.959, y: 36 },
  { x: 50.959, y: 51.384 },
  { x: 36, y: 132.384 },
];

describe("computeGraphicBoundary", () => {
  it("returns a closed loop of the decoded polygon vertices", () => {
    const object = graphic({
      bounds: { xPoints: 36, yPoints: 36, widthPoints: 275.959, heightPoints: 96.384 },
      shape: "polygon",
      polygon: RECT_POLY,
    });
    const boundary = computeGraphicBoundary(object);
    // Closed: first point repeated at the end.
    expect(boundary.length).toBe(RECT_POLY.length + 1);
    expect(boundary[0]).toEqual(boundary[boundary.length - 1]);
    // Decoded vertices preserved in order.
    for (let i = 0; i < RECT_POLY.length; i++) {
      expect(boundary[i]).toEqual([RECT_POLY[i]!.x, RECT_POLY[i]!.y]);
    }
  });

  it("subdivides edges when parameterized, staying on the chords", () => {
    const object = graphic({
      bounds: { xPoints: 36, yPoints: 36, widthPoints: 275.959, heightPoints: 96.384 },
      shape: "polygon",
      polygon: RECT_POLY,
    });
    const boundary = computeGraphicBoundary(object, { edgeSamples: 4 });
    expect(boundary.length).toBe(RECT_POLY.length * 4 + 1);
    // Every sampled point lies on a polygon edge chord.
    const onChord = (p: [number, number]): boolean => {
      for (let i = 0; i < RECT_POLY.length; i++) {
        const a = RECT_POLY[i]!;
        const b = RECT_POLY[(i + 1) % RECT_POLY.length]!;
        const cross = (b.x - a.x) * (p[1]! - a.y) - (b.y - a.y) * (p[0]! - a.x);
        if (Math.abs(cross) > 1e-9) continue;
        const within = Math.min(a.x, b.x) - 1e-9 <= p[0]! && p[0]! <= Math.max(a.x, b.x) + 1e-9 &&
          Math.min(a.y, b.y) - 1e-9 <= p[1]! && p[1]! <= Math.max(a.y, b.y) + 1e-9;
        if (within) return true;
      }
      return false;
    };
    for (const point of boundary) expect(onChord(point)).toBe(true);
  });

  it("keeps the boundary within the decoded bounds", () => {
    const bounds = { xPoints: 13.5, yPoints: 29.25, widthPoints: 275.959, heightPoints: 96.384 };
    const object = graphic({
      bounds,
      shape: "polygon",
      polygon: [
        { x: 289.459, y: 125.634 },
        { x: 13.5, y: 125.634 },
        { x: 274.628, y: 110.122 },
        { x: 289.459, y: 29.25 },
      ],
    });
    for (const options of [{}, { edgeSamples: 8 }, { cornerRadius: 2, curveSamples: 6 }] as const) {
      const boundary = computeGraphicBoundary(object, options);
      for (const point of boundary) {
        expect(point[0]).toBeGreaterThanOrEqual(bounds.xPoints - 1e-9);
        expect(point[0]).toBeLessThanOrEqual(bounds.xPoints + bounds.widthPoints + 1e-9);
        expect(point[1]).toBeGreaterThanOrEqual(bounds.yPoints - 1e-9);
        expect(point[1]).toBeLessThanOrEqual(bounds.yPoints + bounds.heightPoints + 1e-9);
      }
      expect(boundary[0]).toEqual(boundary[boundary.length - 1]);
    }
  });

  it("is monotonic along an axis-aligned edge", () => {
    const object = graphic({
      bounds: { xPoints: 0, yPoints: 0, widthPoints: 100, heightPoints: 50 },
      shape: "polygon",
      polygon: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
    });
    const boundary = computeGraphicBoundary(object, { edgeSamples: 10 });
    // First 11 points walk the top edge left -> right (t=0..1 of edge 1).
    let previousX = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const point = boundary[i]!;
      expect(point[1]).toBeCloseTo(0, 9);
      expect(point[0]).toBeGreaterThanOrEqual(previousX);
      previousX = point[0]!;
    }
    expect(previousX).toBeCloseTo(100, 9);
  });

  it("samples an ellipse over the bounds for ellipse frames", () => {
    const object = graphic({
      bounds: { xPoints: 36, yPoints: 36, widthPoints: 200, heightPoints: 100 },
      shape: "ellipse",
    });
    const boundary = computeGraphicBoundary(object, { curveSamples: 8 });
    expect(boundary.length).toBe(8 * 4 + 1);
    expect(boundary[0]).toEqual(boundary[boundary.length - 1]);
    const cx = 136, cy = 86;
    for (const point of boundary) {
      // On the ellipse (within grid tolerance) and within the bounds.
      const value = ((point[0]! - cx) / 100) ** 2 + ((point[1]! - cy) / 50) ** 2;
      expect(value).toBeCloseTo(1, 6);
      expect(point[0]).toBeGreaterThanOrEqual(36 - 1e-9);
      expect(point[0]).toBeLessThanOrEqual(236 + 1e-9);
      expect(point[1]).toBeGreaterThanOrEqual(36 - 1e-9);
      expect(point[1]).toBeLessThanOrEqual(136 + 1e-9);
    }
  });

  it("falls back to the bounds rectangle for unshaped graphics", () => {
    const object = graphic({
      bounds: { xPoints: 10, yPoints: 20, widthPoints: 30, heightPoints: 40 },
      shape: "rectangle",
    });
    const boundary = computeGraphicBoundary(object);
    expect(boundary).toEqual([[10, 20], [40, 20], [40, 60], [10, 60], [10, 20]]);
  });

  it("ignores the object id: identical geometry yields identical boundaries", () => {
    const make = (id: number) =>
      graphic({
        id,
        bounds: { xPoints: 36, yPoints: 36, widthPoints: 275.959, heightPoints: 96.384 },
        shape: "polygon",
        polygon: RECT_POLY,
        fillColorIndex: 2,
        borderStyle: 1,
        borderWidth: 1,
      });
    expect(computeGraphicBoundary(make(34))).toEqual(computeGraphicBoundary(make(35)));
    expect(computeGraphicBoundary(make(34))).toEqual(computeGraphicBoundary(make(999)));
  });
});
