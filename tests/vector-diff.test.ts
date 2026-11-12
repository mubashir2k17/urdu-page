import { describe, expect, it } from "vitest";

import {
  compareVectorBoxes,
  parsePathBox,
  parseSvgGlyphBoxes,
  parseSvgPathBoxes,
  parseTransform,
} from "../tools/vector-diff.js";

describe("vector PDF diff", () => {
  it("extracts absolute and relative path bounds", () => {
    expect(parsePathBox("M 0 0 L 10 0 L 10 10 Z")).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });
    expect(parsePathBox("m 1 1 l 4 0 l 0 4 z")).toMatchObject({ x: 1, y: 1, width: 4, height: 4 });
    expect(parsePathBox("M 20 5 C 25 0 30 10 35 5")).toMatchObject({ x: 20, y: 0, width: 15, height: 10 });
    expect(parsePathBox("M 4 4 L 4 4 Z")).toBeUndefined();
  });

  it("reads path boxes from an SVG document", () => {
    const boxes = parseSvgPathBoxes(
      '<svg><path d="M 0 0 L 10 0 L 10 10 Z"/><path d="M 20 0 L 30 0 L 30 10 Z"/></svg>',
    );
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toMatchObject({ x: 20, width: 10 });
  });

  it("matches identical and shifted outlines by tolerance", () => {
    const reference = parseSvgPathBoxes(
      '<svg><path d="M 0 0 L 10 0 L 10 10 Z"/><path d="M 20 0 L 30 0 L 30 10 Z"/></svg>',
    );
    expect(compareVectorBoxes(reference, reference)).toMatchObject({
      matched: 2, matchRate: 1, meanCenterDelta: 0, meanSizeDelta: 0,
    });
    const shifted = reference.map((box) => ({ ...box, x: box.x + 5 }));
    expect(compareVectorBoxes(reference, shifted, 2)).toMatchObject({
      matched: 0, unmatchedReference: 2, unmatchedGenerated: 2,
    });
  });

  it("places glyph definitions through use transforms", () => {
    const svg = `
      <defs>
        <g id="glyph-1-2"><path d="M 0 0 L 10 0 L 10 10 Z"/></g>
        <g id="glyph-1-3"><path d="M 0 0 L 4 0 L 4 4 Z"/></g>
      </defs>
      <use xlink:href="#glyph-1-2" transform="matrix(0.1, 0, 0, 0.1, 100, 200)"/>
      <use xlink:href="#glyph-1-2" x="10" y="20"/>
      <use xlink:href="#glyph-1-3" transform="translate(20, 30) scale(2)"/>
      <use xlink:href="#missing" transform="translate(0, 0)"/>`;
    const boxes = parseSvgGlyphBoxes(svg);
    expect(boxes).toHaveLength(3);
    expect(boxes[0]).toMatchObject({ x: 100, y: 200, width: 1, height: 1 });
    expect(boxes[1]).toMatchObject({ x: 10, y: 20, width: 10, height: 10 });
    expect(boxes[2]).toMatchObject({ x: 20, y: 30, width: 8, height: 8 });
    expect(parseTransform("translate(1, 2) scale(3)")).toMatchObject({ a: 3, d: 3, e: 1, f: 2 });
  });
});
