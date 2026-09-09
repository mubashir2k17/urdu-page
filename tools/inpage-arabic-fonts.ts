import {readFileSync, existsSync} from "node:fs";
import {join} from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {HarfBuzzTextShaper, LegacyArabicTextShaper, type ArabicLetterForms, type ShapeFont, type TextShaper} from "@inpage/text-shaper";
import {CHAR_MAP_URDU} from "../packages/inp-parser/src/charmap.js";

/** Imported families share the root table's Arabic symbol slots (banks 100/101). */
export function loadArabicFontFamilies(directory: string, data: Uint8Array): {fonts:ShapeFont[]; names:Map<string,ShapeFont>; shapers:Map<string,TextShaper>} {
  const inventory = JSON.parse(readFileSync(join(directory,"inventory.json"),"utf8")) as {fonts:{file:string;family?:string}[]};
  const files = new Map(inventory.fonts.filter(item => item.family).map(item => [item.family!,item.file]));
  const names = new Map<string,ShapeFont>();
  const shapers = new Map<string,TextShaper>();
  const fallbackFont={id:"inpage-arabic-unicode-fallback",bytes:readFileSync(new URL("../fonts/NotoSansArabic-Regular.ttf",import.meta.url))};
  const fonts: ShapeFont[] = [fallbackFont];
  const unicodeShaper=new HarfBuzzTextShaper();
  for (const [family,file] of files) {
    const secondFile = files.get(`${family}01`);
    if (!secondFile || family.startsWith("NOORI") || !existsSync(join(directory,file))) continue;
    const faces = [file,secondFile].map((file,index) => {
      const bytes = readFileSync(join(directory,file));
      const font = fontkit.create(bytes);
      if (!("glyphForCodePoint" in font)) throw new Error("Unsupported Arabic font collection");
      const face = {id:`inpage-arabic-${family}-${index}`,bytes};
      fonts.push(face);
      return {face,font};
    });
    const forms = new Map<string,ArabicLetterForms>();
    const glyphAt = (code:number,delta:number) => {
      const p = 0x51ca4 + code*20 + delta;
      const face = faces[data[p]! - 0xe4];
      const slot = data[p+1]!;
      if (!face || slot < 32) return;
      const glyph = face.font.glyphForCodePoint(0xf000+slot);
      if (!glyph.id) return;
      return {id:glyph.id,fontId:face.face.id,advance:glyph.advanceWidth * 1000 / face.font.unitsPerEm};
    };
    for (const [encoded,char] of Object.entries(CHAR_MAP_URDU)) {
      const code = Number(encoded);
      const isolated = glyphAt(code,6) ?? glyphAt(code,4);
      if (!isolated || forms.has(char)) continue;
      const final = glyphAt(code,8) ?? glyphAt(code,10);
      const medial = glyphAt(code,12);
      const initial = glyphAt(code,16);
      forms.set(char,{isolated,...(final ? {final}:{}),...(medial ? {medial}:{}),...(initial ? {initial}:{}),mark:/\p{M}/u.test(char)});
    }
    // The base Arabic bank carries dedicated lam–alef forms; these share
    // symbol slots across the imported families (isolated then final).
    for(const [text,slot] of [["لا",0x9f],["لأ",0xa2],["لآ",0xa4],["لإ",0xa6]] as const) {
      const face=faces[0]!;
      const at=(slot:number)=>{
        const glyph=face.font.glyphForCodePoint(0xf000+slot);
        return {id:glyph.id,fontId:face.face.id,advance:glyph.advanceWidth*1000/face.font.unitsPerEm};
      };
      const isolated=at(slot),final=at(slot===0x9f?0xa1:slot+1);
      if(isolated.id && final.id)forms.set(text,{isolated,final});
    }
    for (const [arabic,urdu] of [["ك","ک"],["ي","ی"],["ه","ہ"],["ة","ۃ"]]) {
      const form=forms.get(urdu!);
      if(form && !forms.has(arabic!))forms.set(arabic!,form);
    }
    const face = faces[0]!.face;
    names.set(family,face);
    shapers.set(face.id,new LegacyArabicTextShaper(forms,{shape(input){return unicodeShaper.shape({...input,font:fallbackFont});}}));
  }
  return {fonts,names,shapers};
}
