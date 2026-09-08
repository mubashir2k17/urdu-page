import type { ShapeInput, ShapedGlyph, ShapedRun, TextShaper } from "./index.js";

export interface ArabicFormGlyph {
  id: number;
  fontId: string;
  advance: number;
}
export interface ArabicLetterForms {
  isolated: ArabicFormGlyph;
  final?: ArabicFormGlyph;
  medial?: ArabicFormGlyph;
  initial?: ArabicFormGlyph;
  mark?: boolean;
}

/** Contextual symbol-font forms, supplied by the decoded InPage root table. */
export class LegacyArabicTextShaper implements TextShaper {
  constructor(private readonly forms: ReadonlyMap<string, ArabicLetterForms>, private readonly fallback: TextShaper) {}

  shape(input: ShapeInput): ShapedRun {
    const chars = [...input.text.normalize("NFD")];
    if (!chars.length || chars.some(char => !this.forms.has(char))) return this.fallback.shape(input);
    const clusters: {glyph: ArabicFormGlyph; marks: ArabicFormGlyph[]; cluster: number}[] = [];
    const bases = chars.map((char,index) => ({char,index,form:this.forms.get(char)!})).filter(({form}) => !form.mark);
    for (const [index, base] of bases.entries()) {
      const previous = bases[index - 1]?.form;
      const next = bases[index + 1]?.form;
      const joinedBefore = !!previous?.initial && !!base.form.final;
      const joinedAfter = !!base.form.initial && !!next?.final;
      const glyph = joinedBefore && joinedAfter ? base.form.medial ?? base.form.final!
        : joinedBefore ? base.form.final! : joinedAfter ? base.form.initial! : base.form.isolated;
      const end = bases[index + 1]?.index ?? chars.length;
      const marks = chars.slice(base.index + 1,end).map(char => this.forms.get(char)!).filter(form => form.mark).map(form => form.isolated);
      clusters.push({glyph,marks,cluster:base.index});
    }
    if (!clusters.length) return this.fallback.shape(input);
    const glyphs: ShapedGlyph[] = [];
    for (const cluster of input.direction === "rtl" ? clusters.reverse() : clusters) {
      const base = cluster.glyph;
      glyphs.push({id:base.id,fontId:base.fontId,cluster:cluster.cluster,xAdvance:0,yAdvance:0,xOffset:0,yOffset:0});
      for (const mark of cluster.marks) {
        glyphs.push({id:mark.id,fontId:mark.fontId,cluster:cluster.cluster,xAdvance:0,yAdvance:0,
          xOffset:(base.advance-mark.advance)/2,yOffset:0});
      }
      glyphs.at(-1)!.xAdvance = base.advance;
    }
    return {logicalText:input.text,fontId:input.font.id,direction:input.direction,language:input.language,
      script:input.script,unitsPerEm:1000,glyphs,totalAdvance:glyphs.reduce((sum,glyph) => sum+glyph.xAdvance,0),missingGlyphCount:0};
  }
}
