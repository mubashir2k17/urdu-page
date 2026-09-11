import {readFileSync, existsSync} from "node:fs";
import {join} from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {HarfBuzzTextShaper, LegacyArabicTextShaper, type ArabicGlyphSubstitution, type ArabicLetterForms, type ShapeFont, type TextShaper} from "@inpage/text-shaper";
import {ARABIC_KASHIDA_WEIGHTS,ARABIC_MARK_FLAGS} from "./inpage-arabic-glyph-properties.js";
import {ARABIC_SUBSTITUTION_STAGES} from "./inpage-arabic-substitutions.js";
import {CHAR_MAP_URDU} from "../packages/inp-parser/src/charmap.js";
import {SINDHI_CHARACTERS, SINDHI_CONTEXTUAL_SLOTS} from "../packages/inp-parser/src/sindhi-map.js";

/** Imported families share the root table's Arabic symbol slots (banks 100/101). */
export function loadArabicFontFamilies(directory: string, data: Uint8Array): {fonts:ShapeFont[]; names:Map<string,ShapeFont>; shapers:Map<string,TextShaper>} {
  const kashidaWeights=new Map(ARABIC_KASHIDA_WEIGHTS.map(([bank,slot,weight])=>[bank*256+slot,weight]));
  const markFlags=new Map(ARABIC_MARK_FLAGS.map(([bank,slot,flags])=>[bank*256+slot,flags]));
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
    const baseFace=faces[0]!.font;
    const bounds=(slot:number)=>baseFace.glyphForCodePoint(0xf000+slot).bbox;
    const metricScale=1000/baseFace.unitsPerEm;
    // Native 0x408097–0x408272 measures these five glyphs to place marks.
    const upper=(bounds(0xd7).maxY-bounds(0xf7).minY)*metricScale+50;
    const lower=(bounds(0x6f).minY-bounds(0xf4).maxY)*metricScale;
    const lowerAlternate=(bounds(0x74).minY-bounds(0xf4).maxY)*metricScale;
    const properties=(bank:number,slot:number)=>{
      const flags=markFlags.get(bank*256+slot) ?? 0;
      return {kashidaWeight:kashidaWeights.get(bank*256+slot) ?? 0,
        ...(flags&1?{markPosition:"above" as const}:flags&2?{markPosition:"below" as const}:{}),
        aboveMarkOffset:flags&4?upper:0,belowMarkOffset:flags&8?lower:flags&16?lowerAlternate:0};
    };
    const glyphAt = (code:number,delta:number) => {
      const p = 0x51ca4 + code*20 + delta;
      const face = faces[data[p]! - 0xe4];
      const slot = data[p+1]!;
      if (!face || slot < 32) return;
      const glyph = face.font.glyphForCodePoint(0xf000+slot);
      if (!glyph.id) return;
      return {id:glyph.id,fontId:face.face.id,advance:glyph.advanceWidth * 1000 / face.font.unitsPerEm,...properties(data[p]!,slot)};
    };
    if(family==="ZoharSindhi") {
      const at=(slot:number,bank=0)=>{
        if(!slot)return;
        const face=faces[bank]!;
        const glyph=face.font.glyphForCodePoint(0xf000+slot);
        if(!glyph.id)return;
        return {id:glyph.id,fontId:face.face.id,advance:glyph.advanceWidth*1000/face.font.unitsPerEm};
      };
      for(const [code,slots] of SINDHI_CONTEXTUAL_SLOTS) {
        const char=SINDHI_CHARACTERS[code],isolated=at(slots[0]!);
        if(!char || !isolated)continue;
        const final=at(slots[1]!),medial=at(slots[2]!),initial=at(slots[3]!);
        forms.set(char,{isolated,...(final?{final}:{}),...(medial?{medial}:{}),...(initial?{initial}:{}),mark:/\p{M}/u.test(char)});
      }
      // Native Sindhi lam + alef switches to bank e7, slots 21/22.
      const isolated=at(0x21,1),final=at(0x22,1);
      if(isolated && final)forms.set("لا",{isolated,final});
    } else for (const [encoded,char] of Object.entries(CHAR_MAP_URDU)) {
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
    if(family!=="ZoharSindhi")for(const [text,slot] of [["لا",0x9f],["لأ",0xa2],["لآ",0xa4],["لإ",0xa6]] as const) {
      const face=faces[0]!;
      const at=(slot:number)=>{
        const glyph=face.font.glyphForCodePoint(0xf000+slot);
        return {id:glyph.id,fontId:face.face.id,advance:glyph.advanceWidth*1000/face.font.unitsPerEm,...properties(0xe4,slot)};
      };
      const isolated=at(slot),final=at(slot===0x9f?0xa1:slot+1);
      if(isolated.id && final.id)forms.set(text,{isolated,final});
    }
    for (const [arabic,urdu] of [["ك","ک"],["ي","ی"],["ه","ہ"],["ة","ۃ"]]) {
      const form=forms.get(urdu!);
      if(form && !forms.has(arabic!))forms.set(arabic!,form);
    }
    const substitutions:ArabicGlyphSubstitution[][]=family==="ZoharSindhi"?[]:ARABIC_SUBSTITUTION_STAGES.map(stage=>stage.flatMap(([input,output])=>{
      const at=(bank:number,slot:number)=>{
        const face=faces[bank-0xe4];
        if(!face)return;
        const glyph=face.font.glyphForCodePoint(0xf000+slot);
        if(!glyph.id)return;
        return {id:glyph.id,fontId:face.face.id,advance:glyph.advanceWidth*1000/face.font.unitsPerEm,...properties(bank,slot)};
      };
      const glyphs=Array.from({length:input.length/2},(_,i)=>at(input[i*2]!,input[i*2+1]!));
      const replacement=at(output[0]!,output[1]!);
      if(!replacement || glyphs.some(glyph=>!glyph))return [];
      return [{input:glyphs.filter(glyph=>glyph!==undefined),output:replacement}];
    }));
    const kashidaFace=faces[0]!,extension=kashidaFace.font.glyphForCodePoint(0xf0b3);
    const kashida=family!=="ZoharSindhi" && extension.id?{id:extension.id,fontId:kashidaFace.face.id,advance:extension.advanceWidth*1000/kashidaFace.font.unitsPerEm}:undefined;
    const face = faces[0]!.face;
    names.set(family,face);
    shapers.set(face.id,new LegacyArabicTextShaper(forms,{shape(input){return unicodeShaper.shape({...input,font:fallbackFont});}},substitutions,kashida));
  }
  return {fonts,names,shapers};
}
