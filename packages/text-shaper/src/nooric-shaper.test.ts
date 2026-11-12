import { describe, expect, it } from "vitest";

import {
  NooricTextShaper,
  type NooricClassTables,
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

  it("selects a same-code record by its native context list", () => {
    const contextual: readonly NooricRecord[] = [
      { code: 0x82, form: 0, variant: 0, glyphSlot: 11, context: [0x81] },
      { code: 0x82, form: 0, variant: 0, glyphSlot: 10 },
      { code: 0x81, form: 0, variant: 0, glyphSlot: 20 },
      { code: 0x9e, form: 0, variant: 0, glyphSlot: 30 },
    ];
    const contextualShaper = new NooricTextShaper({
      records: contextual, resolver, fontIds: ["v0"], fallback,
    });
    expect(contextualShaper.shape({ ...input, codes: [0x82, 0x81] }).glyphs.map(glyph => glyph.id))
      .toEqual([20, 11]);
    expect(contextualShaper.shape({ ...input, codes: [0x82, 0x9e] }).glyphs.map(glyph => glyph.id))
      .toEqual([30, 10]);
  });

  it("requires a final record's type class to match the preceding form", () => {
    const typed: readonly NooricRecord[] = [
      { code: 0x82, form: 0, variant: 0, glyphSlot: 10 },
      { code: 0x82, form: 1, variant: 0, glyphSlot: 14 },
      { code: 0x82, form: 2, variant: 0, glyphSlot: 12 },
      { code: 0x82, form: 3, variant: 0, glyphSlot: 13 },
      { code: 0x81, form: 1, variant: 0, glyphSlot: 21, type: 2 },
      { code: 0x81, form: 1, variant: 0, glyphSlot: 22 },
    ];
    const typedShaper = new NooricTextShaper({
      records: typed, resolver, fontIds: ["v0"], fallback,
    });
    // Medial beh has form 2, so the type-2 final record wins.
    expect(typedShaper.shape({ ...input, text: "ببب", codes: [0x82, 0x82, 0x81] }).glyphs.map(glyph => glyph.id))
      .toEqual([21, 12, 13]);
    // Initial beh has form 3, so the untyped final record is used.
    expect(typedShaper.shape({ ...input, codes: [0x82, 0x81] }).glyphs.map(glyph => glyph.id))
      .toEqual([22, 13]);
  });

  it("uses the native advance table row when one is supplied", () => {
    const advanceRow = Array.from({ length: 256 }, () => 0);
    advanceRow[0] = 1000;
    advanceRow[10] = 250;
    const tableShaper = new NooricTextShaper({
      records, resolver, fontIds: ["v0"], fallback, advanceTable: [advanceRow],
    });
    const run = tableShaper.shape({ ...input, text: "ب", codes: [0x82] });
    expect(run.glyphs[0]!.xAdvance).toBe(250);
  });

  it("applies the style bias to face selection and the advance row", () => {
    const rows = Array.from({ length: 4 }, () => Array.from({ length: 256 }, () => 0));
    for (let face = 0; face < 4; face++) {
      rows[face]![0] = 1000;
      rows[face]![10] = 100 + face * 100;
    }
    const faces = ["f0", "f1", "f2", "f3"];
    const biased = new NooricTextShaper({
      records, resolver, fontIds: ["v0", "v1", "v2"], fallback,
      advanceTable: rows, faceFontIds: faces,
    });
    const run = biased.shape({ ...input, text: "ب", codes: [0x82], styleBias: 3 });
    expect(run.glyphs[0]).toMatchObject({ fontId: "f3", xAdvance: 400 });
  });

  it("rewrites a ligature range to the target-context record", () => {
    const classTable = Array.from({ length: 256 }, () => 0);
    for (const code of [0x81, 0x82, 0x9e]) classTable[code] = 1;
    const ligatureClasses: NooricClassTables = {
      breakNext: Array.from({ length: 256 }, () => 0),
      joinCapable: classTable,
      nonJoining: Array.from({ length: 256 }, () => 0),
      transparent: [],
      ligatureLeft: [0x9e],
      ligatureRight: [0x9e],
      rangeBreak: [], rangeA: [], rangeB: [], rangeC: [], rangeD: [], rangeE: [],
      rangeF: [], rangeG: [0x81], rangeH: [], rangeI: [], rangeJ: [], rangeK: [],
      rangeL: [], rangeM: [], rangeN: [], rangeO: [],
    };
    const ligatureRecords: readonly NooricRecord[] = [
      { code: 0x81, form: 3, variant: 0, glyphSlot: 10 },
      { code: 0x82, form: 2, variant: 0, glyphSlot: 20 },
      { code: 0x82, form: 2, variant: 0, glyphSlot: 99, context: [0x81] },
      { code: 0x9e, form: 2, variant: 0, glyphSlot: 30 },
      { code: 0x9e, form: 1, variant: 0, glyphSlot: 31 },
    ];
    const ligatureShaper = new NooricTextShaper({
      records: ligatureRecords, resolver, fontIds: ["v0"], fallback,
      classes: ligatureClasses,
    });
    const run = ligatureShaper.shape({
      ...input,
      text: "بببببب",
      codes: [0x81, 0x82, 0x82, 0x82, 0x9e, 0x9e],
    });
    expect(run.glyphs.map(glyph => glyph.id)).toContain(99);
  });
});
