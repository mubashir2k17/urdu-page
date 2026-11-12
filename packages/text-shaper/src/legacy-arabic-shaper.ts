import type { ShapeInput, ShapedGlyph, ShapedRun, TextShaper } from "./index.js";

export interface ArabicFormGlyph {
  id: number;
  fontId: string;
  advance: number;
  kashidaWeight?: number;
  markPosition?: "above"|"below";
  aboveMarkOffset?: number;
  belowMarkOffset?: number;
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
    private readonly substitutions: readonly (readonly ArabicGlyphSubstitution[])[] = [],
    private readonly kashidaGlyph?: ArabicFormGlyph, private readonly spaceAdvance?:number) {}

  shape(input: ShapeInput): ShapedRun {
    if(this.spaceAdvance!==undefined && /^ +$/.test(input.text)) {
      const run=this.fallback.shape(input);
      const advance=this.spaceAdvance*run.unitsPerEm/1000;
      return {...run,glyphs:run.glyphs.map(glyph=>({...glyph,xAdvance:advance})),totalAdvance:advance*run.glyphs.length};
    }
    const scalars = [...input.text];
    if (!scalars.length) return this.fallback.shape(input);
    const mapped = scalars.map(char => this.isMappedScalar(char));
    if (!mapped.some(Boolean)) return this.fallback.shape(input);
    if (mapped.every(Boolean)) {
      return this.shapeMapped(input, this.expand(input.text)) ?? this.fallback.shape(input);
    }
    return this.shapeMixed(input, scalars, mapped);
  }

  /**
   * A scalar is native-shapeable when the root table has its contextual forms.
   * A scalar that needs NFD expansion is accepted only when every decomposed
   * part is mapped; otherwise the whole scalar goes to the fallback.
   */
  private isMappedScalar(char: string): boolean {
    if (this.forms.has(char)) return true;
    const expansion = [...char.normalize("NFD")];
    return expansion.length > 0 && expansion.every(part => this.forms.has(part));
  }

  private expand(text: string): string[] {
    return [...text].flatMap(char => this.forms.has(char) ? [char] : [...char.normalize("NFD")]);
  }

  /** Shape a fully mapped run, or return undefined when there is no base glyph. */
  private shapeMapped(input: ShapeInput, chars: string[]): ShapedRun | undefined {
    if (!chars.length || chars.some(char => !this.forms.has(char))) return undefined;
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
    if (!clusters.length) return undefined;
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
          xOffset:(base.advance-mark.advance)/2,yOffset:mark.markPosition==="above"?base.aboveMarkOffset ?? 0:mark.markPosition==="below"?base.belowMarkOffset ?? 0:0});
      }
      glyphs.at(-1)!.xAdvance = base.advance;
      if(this.kashidaGlyph && base.kashidaWeight)glyphs.at(-1)!.kashida={...this.kashidaGlyph,weight:base.kashidaWeight};
    }
    return {logicalText:input.text,fontId:input.font.id,direction:input.direction,language:input.language,
      script:input.script,unitsPerEm:1000,glyphs,totalAdvance:glyphs.reduce((sum,glyph) => sum+glyph.xAdvance,0),missingGlyphCount:0};
  }

  /**
   * Mixed fallback: keep native root glyphs for mapped scalars and use the
   * fallback shaper only for the unmapped scalars between them. The native
   * route previously gave up on the whole word when one diacritic was missing,
   * which changed the face for entire Aasaar/Batool/Zohar runs.
   */
  private shapeMixed(input: ShapeInput, scalars: string[], mapped: boolean[]): ShapedRun {
    const fallbackRun = this.fallback.shape(input);
    const scale = fallbackRun.unitsPerEm > 0 ? 1000 / fallbackRun.unitsPerEm : 1;
    const ranges: {start:number; end:number}[] = [];
    for (let index = 0; index < mapped.length;) {
      if (!mapped[index]) { index++; continue; }
      const start = index;
      while (index < mapped.length && mapped[index]) index++;
      ranges.push({start, end:index});
    }

    // Shape each mapped range; a range with no base glyph keeps its fallback
    // glyphs (for example a run containing only combining marks).
    const replacements = new Map<number, ShapedGlyph[]>();
    const failed = new Set<number>();
    for (const [rangeIndex, range] of ranges.entries()) {
      const text = scalars.slice(range.start, range.end).join("");
      const segment = this.shapeMapped({...input, text}, this.expand(text));
      if (!segment) { failed.add(rangeIndex); continue; }
      replacements.set(rangeIndex, segment.glyphs.map(glyph => ({...glyph, cluster: glyph.cluster + range.start})));
    }

    const inRange = (cluster: number): boolean => ranges.some((range, index) =>
      !failed.has(index) && cluster >= range.start && cluster < range.end);
    const glyphs: ShapedGlyph[] = fallbackRun.glyphs
      .filter(glyph => !inRange(glyph.cluster))
      .map(glyph => ({
        ...glyph,
        fontId: glyph.fontId ?? fallbackRun.fontId,
        xAdvance: glyph.xAdvance * scale,
        yAdvance: glyph.yAdvance * scale,
        xOffset: glyph.xOffset * scale,
        yOffset: glyph.yOffset * scale,
        ...(glyph.kashida ? {kashida:{...glyph.kashida,advance:glyph.kashida.advance * scale}} : {}),
      }));
    for (const replacement of replacements.values()) glyphs.push(...replacement);
    glyphs.sort((left, right) => input.direction === "rtl"
      ? right.cluster - left.cluster
      : left.cluster - right.cluster);
    return {
      ...fallbackRun,
      logicalText: input.text,
      unitsPerEm: 1000,
      glyphs,
      totalAdvance: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0),
      missingGlyphCount: glyphs.filter(glyph => glyph.id === 0).length,
    };
  }
}
