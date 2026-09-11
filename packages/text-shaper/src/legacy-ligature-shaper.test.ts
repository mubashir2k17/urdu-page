import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HarfBuzzTextShaper, LegacyLigatureTextShaper, type ShapeInput } from "./index.js";

const input: ShapeInput = {
  text: "میں", direction: "rtl", language: "ur", script: "arab",
  font: { id: "fallback", bytes: readFileSync(new URL("../../../fonts/NotoSansArabic-Regular.ttf", import.meta.url)) },
};
const entry = { text: "میں", fontId: "bank", glyphId: 17, advance: 1400, unitsPerEm: 2000 };

describe("legacy whole-word shaping", () => {
  it("keeps punctuation outside joining words and retains joining hamza terminals", () => {
    const shaper = new LegacyLigatureTextShaper([
      entry, {...entry, text:"و",glyphId:18}, {...entry,text:"یءر",glyphId:19},
    ],true);
    const run=shaper.shape({...input,text:"میں، ویءر"});
    expect(run.logicalText).toBe("میں، ویءر");
    expect(run.glyphs.filter(glyph=>glyph.fontId==="bank").map(glyph=>[glyph.id,glyph.cluster]))
      .toEqual([[19,6],[18,5],[17,0]]);
    expect(run.glyphs.some(glyph=>glyph.cluster===3 && !glyph.fontId)).toBe(true);
  });
  it("kerns joining segments using signed Noori bounds in reading order", () => {
    const shaper = new LegacyLigatureTextShaper([
      {text: "ا", fontId: "bank1", glyphId: 1, advance: 180, unitsPerEm: 1000,
        kerning: {right: 11, left: -168, clearance: 85}},
      {text: "کیلا", fontId: "bank24", glyphId: 2, advance: 1064, unitsPerEm: 1000,
        kerning: {right: 586, left: -106, clearance: 85}},
    ], true);
    const run = shaper.shape({...input, text: "اکیلا"});
    expect(run.glyphs.map(glyph => [glyph.id, glyph.cluster, glyph.xAdvance])).toEqual([
      [2, 1, 839], [1, 0, 180],
    ]);
    expect(run.totalAdvance).toBe(1019);
  });

  it("selects the original glyph and normalizes advances to the run's units", () => {
    const run = new LegacyLigatureTextShaper([entry]).shape(input);
    expect(run.logicalText).toBe("میں");
    expect(run.glyphs).toEqual([{ id: 17, fontId: "bank", cluster: 0,
      xAdvance: 700, yAdvance: 0, xOffset: 0, yOffset: 0 }]);
    expect(run.totalAdvance).toBe(700);
  });

  it("preserves kerning across one source space and resets it across repeated spaces", () => {
    const shaper=new LegacyLigatureTextShaper([
      {...entry,unitsPerEm:1000,advance:938,kerning:{right:792,left:-34,clearance:85}},
      {text:"ا",fontId:"alef",glyphId:2,advance:180,unitsPerEm:1000,kerning:{right:11,left:-168,clearance:85}},
    ],true);
    const single=shaper.shape({...input,text:"میں ا"});
    expect(single.glyphs[0]!.xAdvance).toBe(130);
    expect(single.glyphs[1]!.xAdvance).toBe(0);
    const double=shaper.shape({...input,text:"میں  ا"});
    expect(double.glyphs[0]!.xAdvance).toBe(180);
    expect(double.glyphs[1]!.xAdvance).toBe(150);
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
    expect(() => new LegacyLigatureTextShaper([{ ...entry, overlay: { fontId: "bank2", glyphId: 0 } }])).toThrow("Invalid");
  });

  it("draws the second component at the same origin and advances only once", () => {
    const shaper = new LegacyLigatureTextShaper([{ ...entry, overlay: { fontId: "bank2", glyphId: 19 } }]);
    const run = shaper.shape(input);
    expect(run.glyphs).toEqual([
      { id: 17, fontId: "bank", cluster: 0, xAdvance: 0, yAdvance: 0, xOffset: 0, yOffset: 0 },
      { id: 19, fontId: "bank2", cluster: 0, xAdvance: 700, yAdvance: 0, xOffset: 0, yOffset: 0 },
    ]);
    expect(run.totalAdvance).toBe(700);
    expect(run.logicalText).toBe(input.text);
  });
});
