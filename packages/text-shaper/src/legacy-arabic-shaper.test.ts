import {describe,expect,it} from "vitest";
import type {ShapeInput,TextShaper} from "./index.js";
import {LegacyArabicTextShaper,type ArabicLetterForms} from "./legacy-arabic-shaper.js";

describe("Arabic symbol ligatures",()=>{
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
