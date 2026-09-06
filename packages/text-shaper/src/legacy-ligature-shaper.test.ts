import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HarfBuzzTextShaper, LegacyLigatureTextShaper, type ShapeInput } from "./index.js";

const input: ShapeInput = {
  text: "میں", direction: "rtl", language: "ur", script: "arab",
  font: { id: "fallback", bytes: readFileSync(new URL("../../../fonts/NotoSansArabic-Regular.ttf", import.meta.url)) },
};
const entry = { text: "میں", fontId: "bank", glyphId: 17, advance: 1400, unitsPerEm: 2000 };

describe("legacy whole-word shaping", () => {
  it("selects the original glyph and normalizes advances to the run's units", () => {
    const run = new LegacyLigatureTextShaper([entry]).shape(input);
    expect(run.logicalText).toBe("میں");
    expect(run.glyphs).toEqual([{ id: 17, fontId: "bank", cluster: 0,
      xAdvance: 700, yAdvance: 0, xOffset: 0, yOffset: 0 }]);
    expect(run.totalAdvance).toBe(700);
  });

  it("keeps unmatched words and marked variants on HarfBuzz", () => {
    const shaper = new LegacyLigatureTextShaper([entry]);
    const fallback = new HarfBuzzTextShaper();
    for (const text of ["میںَ", "میں،", "تمہیں", "پاکستان"]) {
      expect(shaper.shape({ ...input, text })).toEqual(fallback.shape({ ...input, text }));
    }
  });

  it("preserves scalar clusters, word order, spaces and logical text in mixed runs", () => {
    const text = "😀 میں تم";
    const run = new LegacyLigatureTextShaper([entry]).shape({ ...input, text });
    expect(run.logicalText).toBe(text);
    expect(run.glyphs.find(({ fontId }) => fontId === "bank")?.cluster).toBe(2);
    expect(run.glyphs[0]!.cluster).toBeGreaterThan(2);
    expect(run.glyphs.at(-1)!.cluster).toBe(0);
    expect(run.totalAdvance).toBe(run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0));
  });

  it("rejects ambiguous entries and invalid metrics", () => {
    expect(() => new LegacyLigatureTextShaper([entry, entry])).toThrow("Ambiguous");
    expect(() => new LegacyLigatureTextShaper([{ ...entry, advance: NaN }])).toThrow("Invalid");
  });
});
