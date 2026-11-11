import { describe, expect, it } from "vitest";

import {
  NooricTextShaper,
  type NooricGlyphResolver,
  type NooricRecord,
  type ShapedRun,
  type TextShaper,
} from "./index.js";

const records: readonly NooricRecord[] = [
  { code: 0x82, form: 0, variant: 0, glyphSlot: 10 },
  { code: 0x82, form: 1, variant: 0, glyphSlot: 11 },
  { code: 0x82, form: 2, variant: 0, glyphSlot: 12 },
  { code: 0x82, form: 3, variant: 0, glyphSlot: 13 },
  { code: 0x81, form: 0, variant: 1, glyphSlot: 20 },
  { code: 0x81, form: 1, variant: 1, glyphSlot: 21 },
  { code: 0xab, form: 4, variant: 2, glyphSlot: 30 },
];

const resolver: NooricGlyphResolver = {
  resolve(variant, slot) {
    return { glyphId: variant * 1000 + slot, advance: slot, unitsPerEm: 1000 };
  },
};

const fallbackRun: ShapedRun = {
  logicalText: "fallback",
  fontId: "fallback",
  direction: "rtl",
  language: "ur",
  script: "arab",
  unitsPerEm: 1000,
  glyphs: [],
  totalAdvance: 0,
  missingGlyphCount: 0,
};

const fallback: TextShaper = { shape: () => fallbackRun };

const input = {
  text: "با",
  font: { id: "embedded", bytes: new Uint8Array([0]) },
  direction: "rtl" as const,
  language: "ur",
  script: "arab",
};

function shaper(): NooricTextShaper {
  return new NooricTextShaper({ records, resolver, fontIds: ["v0", "v1", "v2"], fallback });
}

describe("NooricTextShaper", () => {
  it("computes initial and final forms for a joining pair", () => {
    const run = shaper().shape({ ...input, codes: [0x82, 0x81] });
    // RTL visual order: final alef first, then initial beh.
    expect(run.glyphs.map((glyph) => glyph.id)).toEqual([1000 + 21, 13]);
    expect(run.glyphs.map((glyph) => glyph.fontId)).toEqual(["v1", "v0"]);
    expect(run.glyphs.map((glyph) => glyph.xAdvance)).toEqual([21, 13]);
    expect(run.unitsPerEm).toBe(1000);
  });

  it("uses the isolated form for a standalone non-joining letter", () => {
    const run = shaper().shape({ ...input, text: "ا", codes: [0x81] });
    expect(run.glyphs).toHaveLength(1);
    expect(run.glyphs[0]!.id).toBe(1000 + 20);
    expect(run.glyphs[0]!.fontId).toBe("v1");
  });

  it("computes medial and final forms for a three-letter joining run", () => {
    const run = shaper().shape({ ...input, text: "ببا", codes: [0x82, 0x82, 0x81] });
    // RTL visual order: alef final, beh medial, beh initial.
    expect(run.glyphs.map((glyph) => glyph.id)).toEqual([1021, 12, 13]);
  });

  it("uses isolated and final forms for joining letters at word boundaries",()=>{
    expect(shaper().shape({...input,text:"ب",codes:[0x82]}).glyphs[0]!.id).toBe(10);
    const run=shaper().shape({...input,text:"بب",codes:[0x82,0x82]});
    expect(run.glyphs.map(glyph=>glyph.id)).toEqual([11,13]);
  });

  it("uses fallback glyphs for alignment gaps with global clusters",()=>{
    const mixedFallback:TextShaper={shape(input) {
      const glyphs=[...input.text].map((_,cluster)=>({id:900+cluster,cluster,xAdvance:100,yAdvance:0,xOffset:0,yOffset:0}));
      return {...fallbackRun,logicalText:input.text,glyphs,totalAdvance:glyphs.length*100};
    }};
    const mixed=new NooricTextShaper({records,resolver,fontIds:["v0","v1","v2"],fallback:mixedFallback});
    const run=mixed.shape({...input,text:"ب ا",codes:[0x82,undefined,0x81]});
    expect(run.glyphs.map(glyph=>glyph.id)).toEqual([1020,900,10]);
    expect(run.glyphs.map(glyph=>glyph.cluster)).toEqual([2,1,0]);
    expect(run.glyphs.map(glyph=>glyph.fontId)).toEqual(["v1","fallback","v0"]);
    expect(run.glyphs.map(glyph=>glyph.xAdvance)).toEqual([20,100,10]);
    expect(run.legacyCodeShaped).toBe(true);
  });

  it("gives form-four records zero advance",()=>{
    const run=shaper().shape({...input,text:"بَ",codes:[0x82,0xab]});
    expect(run.glyphs.map(glyph=>glyph.id)).toEqual([2030,10]);
    expect(run.glyphs.map(glyph=>glyph.xAdvance)).toEqual([0,10]);
  });

  it("falls back when aligned codes do not match the scalar count",()=>{
    const run=shaper().shape({...input,codes:[0x82]});
    expect(run).toBe(fallbackRun);
  });

  it("falls back when no legacy codes are supplied", () => {
    const run = shaper().shape(input);
    expect(run).toBe(fallbackRun);
  });

  it("skips records that have no glyph resolution", () => {
    const empty = new NooricTextShaper({
      records,
      resolver: { resolve: () => undefined },
      fontIds: ["v0", "v1", "v2"],
      fallback,
    });
    const run = empty.shape({ ...input, codes: [0x82, 0x81] });
    expect(run.glyphs).toHaveLength(0);
    expect(run.missingGlyphCount).toBe(0);
  });
});
