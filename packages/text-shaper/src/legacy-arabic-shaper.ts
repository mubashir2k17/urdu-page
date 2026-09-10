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

export interface ArabicGlyphSubstitution {
  input: readonly Pick<ArabicFormGlyph,"id"|"fontId">[];
  output: ArabicFormGlyph;
}

/** Contextual symbol-font forms, supplied by the decoded InPage root table. */
export class LegacyArabicTextShaper implements TextShaper {
  constructor(private readonly forms: ReadonlyMap<string, ArabicLetterForms>, private readonly fallback: TextShaper,
    private readonly substitutions: readonly (readonly ArabicGlyphSubstitution[])[] = []) {}

  shape(input: ShapeInput): ShapedRun {
    const chars = [...input.text].flatMap(char=>
      this.forms.has(char)?[char]:[...char.normalize("NFD")]);
    if (!chars.length || chars.some(char => !this.forms.has(char))) return this.fallback.shape(input);
    const clusters: {glyph: ArabicFormGlyph; marks: ArabicFormGlyph[]; cluster: number}[] = [];
    const letters = chars.map((char,index) => ({char,index,form:this.forms.get(char)!})).filter(({form}) => !form.mark);
    const bases:typeof letters=[];
    for(let index=0;index<letters.length;index++) {
      const letter=letters[index]!,next=letters[index+1];
      const ligature=next && this.forms.get(letter.char+next.char);
      if(ligature) {bases.push({...letter,char:letter.char+next!.char,form:ligature});index++;}
      else bases.push(letter);
    }
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
    // Native substitutions run in logical order after contextual forms. A
    // mark-only combination remains attached to its base without an advance.
    let sequence=clusters.flatMap(({glyph,marks,cluster})=>[
      {glyph,cluster,mark:false},...marks.map(glyph=>({glyph,cluster,mark:true})),
    ]);
    for(const rules of this.substitutions) {
      const replaced:typeof sequence=[];
      for(let index=0;index<sequence.length;) {
        const rule=rules.find(rule=>rule.input.length>0 && rule.input.every((expected,offset)=>{
          const actual=sequence[index+offset]?.glyph;
          return actual?.id===expected.id && actual.fontId===expected.fontId;
        }));
        if(!rule){replaced.push(sequence[index++]!);continue;}
        const consumed=sequence.slice(index,index+rule.input.length);
        replaced.push({glyph:rule.output,cluster:consumed[0]!.cluster,mark:consumed.every(item=>item.mark)});
        index+=rule.input.length;
      }
      sequence=replaced;
    }
    clusters.length=0;
    for(const item of sequence) {
      if(item.mark && clusters.length)clusters.at(-1)!.marks.push(item.glyph);
      else clusters.push({glyph:item.glyph,marks:[],cluster:item.cluster});
    }
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
