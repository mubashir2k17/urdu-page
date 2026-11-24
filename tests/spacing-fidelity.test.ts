// Fast spacing micro-corpus. These cases assert exact pen positions from the
// recording backend, not raster overlap, so a 0.1–0.5 pt measure/draw split or
// a spacing-zone regression fails here instead of hiding behind a 36-dpi pass.

import { describe, expect, it } from "vitest";

import type { PageObject, Story, TextStyle } from "@inpage/document-model";
import type { ShapedGlyph, ShapedRun } from "@inpage/text-shaper";

import { drawStyledStory } from "../packages/pdf-renderer/src/styled-layout.js";
import {
  lineExtent,
  penIsContinuous,
  percentile,
  RecordingBackend,
  traceCalls,
  wordGaps,
} from "../tools/spacing-trace.js";

type Direction = "ltr" | "rtl";
type Shape = (
  text: string,
  direction: Direction,
  style?: TextStyle,
  codes?: readonly (number | undefined)[],
  legacyRunKind?: number,
) => ShapedRun;

interface SavedSpacing {
  characterSpacing?: number;
  extraSpace?: number;
  kashidaCount?: number;
}

function savedRunOptions(saved: SavedSpacing | undefined): SavedSpacing {
  if (!saved) return {};
  const out: SavedSpacing = {};
  if (saved.characterSpacing !== undefined) out.characterSpacing = saved.characterSpacing;
  if (saved.extraSpace !== undefined) out.extraSpace = saved.extraSpace;
  if (saved.kashidaCount !== undefined) out.kashidaCount = saved.kashidaCount;
  return out;
}

function makeStory(
  text: string,
  style: TextStyle,
  width: number,
  options: {x?: number; y?: number; rotationDegrees?: number; saved?: SavedSpacing} = {},
): {story: Story; object: PageObject} {
  const direction: Direction = /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr";
  const x = options.x ?? 10;
  const y = options.y ?? 20;
  const object: PageObject = {
    id: 1,
    kind: "text",
    bounds: {xPoints: x, yPoints: y, widthPoints: width, heightPoints: 40},
    sourceOffset: 0,
    confidence: "high",
    ...(options.rotationDegrees ? {rotationDegrees: options.rotationDegrees} : {}),
  };
  const story: Story = {
    index: 0,
    startOffset: 0,
    endOffset: 0,
    paragraphs: [],
    cachedLayout: {
      frameId: 1,
      columnWidth: width,
      contentHeight: 40,
      columns: 1,
      lines: [{
        height: 40,
        baseline: 25,
        width,
        paragraphStart: true,
        runs: [{
          x: 0,
          width,
          direction,
          ...savedRunOptions(options.saved),
          runs: [{kind: "text", text, style}],
        }],
      }],
    },
  };
  return {story, object};
}

function makeShape(
  advance: (char: string) => number,
  kashida?: (char: string) => {id: number; fontId: string; advance: number; weight: number},
): Shape {
  return (text, direction): ShapedRun => {
    const glyphs: ShapedGlyph[] = [...text].map((char, cluster) => {
      const extension = kashida?.(char);
      return {
        id: (char.codePointAt(0) ?? 1) & 0xffff,
        cluster,
        xAdvance: advance(char),
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
        ...(extension ? {kashida: extension} : {}),
      };
    });
    return {
      logicalText: text,
      fontId: "test",
      direction,
      language: direction === "rtl" ? "ur" : "en",
      script: direction === "rtl" ? "arab" : "latn",
      unitsPerEm: 1000,
      glyphs,
      totalAdvance: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0),
      missingGlyphCount: 0,
    };
  };
}

const ARABIC: TextStyle = {fontSize: 10, arabicFontName: "Aasaar"};

describe("spacing micro-corpus", () => {
  it("gives a saved line's residual to word spaces without scaling letters", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("ب  ت", ARABIC, 50);
    const shape = makeShape((char) => (char === " " ? 250 : 500));
    drawStyledStory(story, object, backend, shape, 200);

    // Font truth is untouched for letters.
    for (const letter of ["ب", "ت"]) {
      expect(backend.calls.find((call) => call.run.logicalText === letter)!.run.totalAdvance).toBe(500);
    }
    // Both spaces stretch to absorb the 35 pt residual.
    expect(backend.calls.find((call) => call.run.logicalText === "  ")!.run.totalAdvance).toBe(4000);

    const traced = traceCalls(backend.calls);
    const extent = lineExtent(traced);
    expect(extent.start).toBeCloseTo(10, 6);
    expect(extent.width).toBeCloseTo(50, 6);
    expect(penIsContinuous(traced)).toBe(true);
    expect(wordGaps(traced)[0]).toBeCloseTo(40, 6);
  });

  it("preserves leading glue and its exact count", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("  ب", ARABIC, 20);
    const shape = makeShape((char) => (char === " " ? 250 : 500));
    drawStyledStory(story, object, backend, shape, 200);

    // Two leading spaces stay one glue run and absorb the positive residual.
    const glue = backend.calls.filter((call) => /^\s+$/.test(call.run.logicalText));
    expect(glue).toHaveLength(1);
    expect(glue[0]!.run.logicalText).toBe("  ");
    expect(glue[0]!.run.totalAdvance).toBe(1500);
    expect(penIsContinuous(traceCalls(backend.calls))).toBe(true);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(20, 6);
  });

  it("applies character and word spacing per glue unit", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("A B  ", {fontSize: 10}, 30.5, {
      saved: {characterSpacing: 0.5, extraSpace: 1},
    });
    const shape = makeShape(() => 500);
    drawStyledStory(story, object, backend, shape, 200);

    const advanceOf = (text: string) =>
      backend.calls.find((call) => call.run.logicalText === text)!.run.totalAdvance;
    expect(advanceOf("A")).toBe(550);
    expect(advanceOf(" ")).toBe(650);
    expect(advanceOf("B")).toBe(550);
    expect(advanceOf("  ")).toBe(1300);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(30.5, 6);
  });

  it("adds tracking from the style to every non-space glyph", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("AB", {fontSize: 10, trackingEm: 0.1}, 12);
    const shape = makeShape(() => 500);
    drawStyledStory(story, object, backend, shape, 200);

    const run = backend.calls.find((call) => call.run.logicalText === "AB")!.run;
    expect(run.glyphs.map((glyph) => glyph.xAdvance)).toEqual([600, 600]);
    expect(run.totalAdvance).toBe(1200);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(12, 6);
  });

  it("honours horizontal scale on the drawn appearance and on the extent", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("AB", {fontSize: 10, horizontalScale: 2}, 20);
    const shape = makeShape(() => 500);
    drawStyledStory(story, object, backend, shape, 200);

    const call = backend.calls.find((entry) => entry.run.logicalText === "AB")!;
    expect(call.appearance.horizontalScale).toBe(2);
    expect(call.run.glyphs.map((glyph) => glyph.xAdvance)).toEqual([500, 500]);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(20, 6);
  });

  it("keeps a rotated saved run on its saved extent", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("AB", {fontSize: 10}, 10, {rotationDegrees: 90});
    const shape = makeShape(() => 500);
    drawStyledStory(story, object, backend, shape, 200);

    expect(backend.calls.every((call) => call.rotation === 90)).toBe(true);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(10, 6);
  });

  it("does not rescale zero- or negative-width overlay runs", () => {
    const backend = new RecordingBackend();
    const object: PageObject = {
      id: 1,
      kind: "text",
      bounds: {xPoints: 10, yPoints: 20, widthPoints: 100, heightPoints: 40},
      sourceOffset: 0,
      confidence: "high",
    };
    const story: Story = {
      index: 0,
      startOffset: 0,
      endOffset: 0,
      paragraphs: [],
      cachedLayout: {
        frameId: 1,
        columnWidth: 100,
        contentHeight: 40,
        columns: 1,
        lines: [{
          height: 40,
          baseline: 25,
          width: 100,
          runs: [
            {x: 30, width: -1, direction: "rtl", runs: [{kind: "text", text: "ہ", style: ARABIC}]},
            {x: 45, width: 0, direction: "rtl", runs: [{kind: "text", text: "سے", style: ARABIC}]},
          ],
        }],
      },
    };
    const shape = makeShape(() => 500);
    drawStyledStory(story, object, backend, shape, 200);

    expect(backend.calls.map((call) => call.x)).toEqual([40, 55]);
  });

  it("stretches kashida carriers continuously instead of scaling the line", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("بت", ARABIC, 15, {saved: {kashidaCount: 2}});
    const shape = makeShape(() => 500, () => ({id: 90, fontId: "test", advance: 100, weight: 1}));
    drawStyledStory(story, object, backend, shape, 200);

    const run = backend.calls.find((call) => /\S/.test(call.run.logicalText))!.run;
    const carriers = run.glyphs.filter((glyph) => glyph.id !== 90);
    const inserted = run.glyphs.filter((glyph) => glyph.id === 90);
    expect(inserted).toHaveLength(2);
    expect(carriers.map((glyph) => glyph.xAdvance)).toEqual([650, 650]);
    expect(inserted.map((glyph) => glyph.xAdvance)).toEqual([100, 100]);
    expect(run.totalAdvance).toBe(1500);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(15, 6);
  });

  it("positions tab cells from decoded stops rather than accumulated width", () => {
    const backend = new RecordingBackend();
    const object: PageObject = {
      id: 1,
      kind: "text",
      bounds: {xPoints: 0, yPoints: 0, widthPoints: 100, heightPoints: 40},
      sourceOffset: 0,
      confidence: "high",
    };
    const style: TextStyle = {fontSize: 10, tabStops: [{position: 50, alignment: 0}]};
    const story: Story = {
      index: 0,
      startOffset: 0,
      endOffset: 0,
      paragraphs: [{
        index: 0,
        startOffset: 0,
        endOffset: 0,
        runs: [{kind: "text", text: "A\tB", style}],
      }],
    };
    const shape = makeShape(() => 500);
    drawStyledStory(story, object, backend, shape, 200);

    expect(backend.calls.map((call) => call.x)).toEqual([95, 45]);
  });

  it("bounds line-endpoint error against the saved extent", () => {
    // Not a raster check: this asserts the pen model itself is internally
    // consistent for a longer line, so measure and draw cannot disagree.
    const backend = new RecordingBackend();
    const {story, object} = makeStory("A B C D E", {fontSize: 10}, 60);
    const shape = makeShape((char) => (char === " " ? 250 : 500));
    drawStyledStory(story, object, backend, shape, 200);

    const traced = traceCalls(backend.calls);
    const extent = lineExtent(traced);
    expect(Math.abs(extent.width - 60)).toBeLessThanOrEqual(0.5);
    expect(penIsContinuous(traced)).toBe(true);
    const gapSpread = percentile(wordGaps(traced), 0.95) - percentile(wordGaps(traced), 0.05);
    expect(gapSpread).toBeLessThanOrEqual(0.25);
  });

  it("applies per-font space calibration to the natural space advance", () => {
    const render = (spaceScale?: number) => {
      const backend = new RecordingBackend();
      const {story, object} = makeStory("A B", {fontSize: 20}, 60);
      drawStyledStory(story, object, backend, makeShape(() => 500), 200, undefined,
        spaceScale === undefined ? {} : {calibration: {fonts: {test: {spaceScale}}}});
      return backend;
    };
    expect(render().calls.find((call) => call.run.logicalText === "B")!.x).toBe(50);
    expect(render(2).calls.find((call) => call.run.logicalText === "B")!.x).toBe(55);
  });

  it("applies tracking calibration before the Arabic space fit", () => {
    const render = (trackingScale?: number) => {
      const backend = new RecordingBackend();
      const {story, object} = makeStory("ب ت", {...ARABIC, trackingEm: 0.1}, 20);
      drawStyledStory(story, object, backend, makeShape(() => 500), 200, undefined,
        trackingScale === undefined ? {} : {calibration: {fonts: {test: {trackingScale}}}});
      return backend;
    };
    expect(render().calls.find((call) => call.run.logicalText === "ب")!.x).toBeCloseTo(24, 6);
    expect(render(0.5).calls.find((call) => call.run.logicalText === "ب")!.x).toBeCloseTo(24.5, 6);
  });

  it("scales inserted kashida extensions from calibration", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("بت", ARABIC, 15, {saved: {kashidaCount: 2}});
    const shape = makeShape(() => 500, () => ({id: 90, fontId: "test", advance: 100, weight: 1}));
    drawStyledStory(story, object, backend, shape, 200, undefined,
      {calibration: {fonts: {test: {kashidaUnit: 2}}}});

    const run = backend.calls.find((call) => /\S/.test(call.run.logicalText))!.run;
    expect(run.glyphs.filter((glyph) => glyph.id === 90).map((glyph) => glyph.xAdvance)).toEqual([200, 200]);
    expect(run.glyphs.filter((glyph) => glyph.id !== 90).map((glyph) => glyph.xAdvance)).toEqual([550, 550]);
    expect(run.totalAdvance).toBe(1500);
  });

  it("uses Tc/Tw priors when the saved run carries no spacing", () => {
    const backend = new RecordingBackend();
    const {story, object} = makeStory("A B", {fontSize: 10}, 17);
    drawStyledStory(story, object, backend, makeShape(() => 500), 200, undefined,
      {priors: {characterSpacing: 0.5, wordSpacing: 1}});

    const advanceOf = (text: string) =>
      backend.calls.find((call) => call.run.logicalText === text)!.run.totalAdvance;
    expect(advanceOf("A")).toBe(550);
    expect(advanceOf(" ")).toBe(650);
    expect(advanceOf("B")).toBe(500);
    expect(backend.calls.find((call) => call.run.logicalText === "B")!.x).toBeCloseTo(22, 6);
    expect(lineExtent(traceCalls(backend.calls)).width).toBeCloseTo(17, 6);
  });
});
