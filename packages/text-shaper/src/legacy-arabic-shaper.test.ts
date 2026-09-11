import {describe,expect,it} from "vitest";
import type {ShapeInput,TextShaper} from "./index.js";
import {LegacyArabicTextShaper,type ArabicLetterForms} from "./legacy-arabic-shaper.js";

describe("Arabic symbol ligatures",()=>{
  it("combines marks in source order without adding a character advance",()=>{
    const glyph=(id:number,advance=500)=>({id,fontId:"arabic",advance});
    const forms=new Map<string,ArabicLetterForms>([
      ["ب",{isolated:glyph(1)}],
      ["ّ",{isolated:glyph(2),mark:true}],
      ["َ",{isolated:glyph(3),mark:true}],
    ]);
    const shaper=new LegacyArabicTextShaper(forms,{shape(){throw Error("Unexpected fallback");}},
      [[{input:[glyph(2),glyph(3)],output:glyph(4)}]]);
    const run=shaper.shape({text:"بَّ",font:{id:"arabic",bytes:new Uint8Array()},direction:"rtl",language:"ar",script:"arab"});
    expect(run.glyphs.map(g=>[g.id,g.cluster,g.xAdvance])).toEqual([[1,0,0],[4,0,500]]);
    expect(run.totalAdvance).toBe(500);
    expect(run.logicalText).toBe("بَّ");
  });
  it("positions marks from the selected base and exposes elongation after the complete cluster",()=>{
    const forms=new Map<string,ArabicLetterForms>([
      ["ب",{isolated:{id:1,fontId:"arabic",advance:500,aboveMarkOffset:240,belowMarkOffset:-310,kashidaWeight:3}}],
      ["َ",{isolated:{id:2,fontId:"arabic",advance:160,markPosition:"above"},mark:true}],
      ["ِ",{isolated:{id:3,fontId:"arabic",advance:160,markPosition:"below"},mark:true}],
    ]);
    const shaper=new LegacyArabicTextShaper(forms,{shape(){throw Error("Unexpected fallback");}},[],{id:4,fontId:"arabic",advance:200});
    const run=shaper.shape({text:"بَِ",font:{id:"arabic",bytes:new Uint8Array()},direction:"rtl",language:"ar",script:"arab"});
    expect(run.glyphs.map(glyph=>[glyph.id,glyph.yOffset,glyph.xAdvance])).toEqual([[1,0,0],[2,240,0],[3,-310,500]]);
    expect(run.glyphs[0]!.kashida).toBeUndefined();
    expect(run.glyphs.at(-1)!.kashida).toEqual({id:4,fontId:"arabic",advance:200,weight:3});
    expect(run.logicalText).toBe("بَِ");
  });
  it("joins lam–alef to a preceding letter and preserves intervening marks",()=>{
    const glyph=(id:number,advance=500)=>({id,fontId:"arabic",advance});
    const forms=new Map<string,ArabicLetterForms>([
      ["ب",{isolated:glyph(1),initial:glyph(2),final:glyph(3)}],
      ["ل",{isolated:glyph(4),initial:glyph(5),final:glyph(6)}],
      ["ا",{isolated:glyph(7),final:glyph(8)}],
      ["لا",{isolated:glyph(9),final:glyph(10)}],
      ["َ",{isolated:glyph(11,0),mark:true}],
    ]);
    const fallback:TextShaper={shape(){throw Error("Unexpected fallback");}};
    const shaper=new LegacyArabicTextShaper(forms,fallback);
    const input:ShapeInput={text:"بلَا",font:{id:"arabic",bytes:new Uint8Array()},direction:"rtl",language:"ar",script:"arab"};
    const run=shaper.shape(input);
    expect(run.logicalText).toBe("بلَا");
    expect(run.glyphs.map(glyph=>[glyph.id,glyph.cluster,glyph.xAdvance])).toEqual([[10,1,0],[11,1,500],[2,0,500]]);
    expect(shaper.shape({...input,text:"لا"}).glyphs[0]!.id).toBe(9);
  });
});
