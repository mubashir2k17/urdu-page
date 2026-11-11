// Character-level Noori (NOORIC) shaper, ported from the native selector
// (FUN_00413060). It consumes legacy InPage codes, computes joining forms,
// selects 44-byte records, and emits positioned glyphs. Glyph resolution is
// injected so this module stays independent of the vendor font files and of the
// tools that extract the record table.
//
// See docs/reverse-engineering/noori-shaping.md for the evidence.

import type { ShapeInput, ShapedGlyph, ShapedRun, TextShaper } from "./index.js";

export interface NooricRecord {
  /** Legacy second-byte code (0x81..). */
  code: number;
  /** Joining form: 0 isolated, 1 final, 2 medial, 3 initial, 4 any. */
  form: number;
  /** NOORIC sub-variant (0..2) selecting the face. */
  variant: number;
  /** Glyph slot in the face (record+0x06 low byte). */
  glyphSlot: number;
}

export interface ResolvedGlyph {
  glyphId: number;
  advance: number;
  unitsPerEm: number;
}

export interface NooricGlyphResolver {
  resolve(variant: number, slot: number): ResolvedGlyph | undefined;
}

export interface NooricTextShaperOptions {
  records: readonly NooricRecord[];
  resolver: NooricGlyphResolver;
  /** Font id per variant index. */
  fontIds: readonly string[];
  /** Used when input codes are absent. */
  fallback: TextShaper;
  /** Normalized run units; defaults to the first resolved glyph's em. */
  unitsPerEm?: number;
}

export const FORM_ISOLATED = 0;
export const FORM_FINAL = 1;
export const FORM_MEDIAL = 2;
export const FORM_INITIAL = 3;
export const FORM_ANY = 4;

function joiningForm(notJoinPrev: boolean, notJoinNext: boolean): number {
  if (notJoinPrev) return notJoinNext ? FORM_ISOLATED : FORM_INITIAL;
  return notJoinNext ? FORM_FINAL : FORM_MEDIAL;
}

export class NooricTextShaper implements TextShaper {
  private readonly byKey = new Map<string, NooricRecord>();
  private readonly formsByCode = new Map<number, Set<number>>();
  private readonly options: NooricTextShaperOptions;

  constructor(options: NooricTextShaperOptions) {
    this.options = options;
    for (const record of options.records) {
      if (!Number.isInteger(record.code) || !Number.isInteger(record.form)) {
        throw new Error("Invalid Nooric record");
      }
      const key = `${record.code}:${record.form}`;
      if (!this.byKey.has(key)) this.byKey.set(key, record);
      let forms = this.formsByCode.get(record.code);
      if (!forms) {
        forms = new Set();
        this.formsByCode.set(record.code, forms);
      }
      forms.add(record.form);
    }
  }

  shape(input: ShapeInput): ShapedRun {
    const codes = input.codes;
    const scalars = [...input.text];
    if (!codes || codes.length === 0 || codes.length !== scalars.length ||
        !codes.some(code => code !== undefined)) {
      return this.options.fallback.shape(input);
    }

    interface Segment {
      start: number;
      end: number;
      coded: boolean;
    }
    const segments: Segment[] = [];
    for (let index = 0; index < scalars.length;) {
      const coded = codes[index] !== undefined;
      const start = index;
      do index++; while (index < scalars.length && (codes[index] !== undefined) === coded);
      segments.push({start,end:index,coded});
    }

    interface ShapedSegment {
      start: number;
      glyphs: ShapedGlyph[];
      unitsPerEm: number;
    }
    const shaped: ShapedSegment[] = [];
    let nooricUnits: number | undefined;
    let usedNooric = false;
    for (const segment of segments) {
      if (segment.coded) {
        const result = this.shapeCodedSegment(
          input,
          codes.slice(segment.start,segment.end) as number[],
          segment.start,
        );
        if (result) {
          nooricUnits ??= result.unitsPerEm;
          usedNooric = true;
          shaped.push({start:segment.start,...result});
          continue;
        }
      }
      const text = scalars.slice(segment.start,segment.end).join("");
      const fallbackInput = {...input,text};
      delete fallbackInput.codes;
      const fallback = this.options.fallback.shape(fallbackInput);
      shaped.push({
        start: segment.start,
        unitsPerEm: fallback.unitsPerEm,
        glyphs: fallback.glyphs.map(glyph => ({
          ...glyph,
          cluster: glyph.cluster + segment.start,
          fontId: glyph.fontId ?? fallback.fontId,
        })),
      });
    }

    const unitsPerEm = this.options.unitsPerEm ?? nooricUnits ?? shaped[0]?.unitsPerEm ?? 1000;
    const ordered = input.direction === "rtl" ? shaped.reverse() : shaped;
    const glyphs = ordered.flatMap(segment => {
      const scale = unitsPerEm / segment.unitsPerEm;
      return segment.glyphs.map(glyph => ({
        ...glyph,
        xAdvance: glyph.xAdvance * scale,
        yAdvance: glyph.yAdvance * scale,
        xOffset: glyph.xOffset * scale,
        yOffset: glyph.yOffset * scale,
        ...(glyph.kashida ? {kashida:{...glyph.kashida,advance:glyph.kashida.advance*scale}} : {}),
      }));
    });
    return {
      logicalText: input.text,
      fontId: input.font.id,
      direction: input.direction,
      language: input.language,
      script: input.script,
      unitsPerEm,
      ...(usedNooric ? {legacyCodeShaped:true} : {}),
      glyphs,
      totalAdvance: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0),
      missingGlyphCount: glyphs.filter(glyph => glyph.id === 0).length,
    };
  }

  private shapeCodedSegment(
    input: ShapeInput,
    codes: readonly number[],
    clusterOffset: number,
  ): {glyphs:ShapedGlyph[];unitsPerEm:number} | undefined {
    const canJoinNext = (code: number): boolean => this.formsByCode.get(code)?.has(FORM_INITIAL) ?? false;
    const canJoinPrevious = (code: number): boolean => this.formsByCode.get(code)?.has(FORM_FINAL) ?? false;
    const isTransparent = (code: number): boolean => {
      const forms = this.formsByCode.get(code);
      return !!forms?.size && [...forms].every(form => form === FORM_ANY);
    };
    const logical: {record:NooricRecord;resolved:NonNullable<ReturnType<NooricGlyphResolver["resolve"]>>;index:number}[] = [];
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index]!;
      let previousIndex = index - 1;
      let nextIndex = index + 1;
      while (previousIndex >= 0 && isTransparent(codes[previousIndex]!)) previousIndex--;
      while (nextIndex < codes.length && isTransparent(codes[nextIndex]!)) nextIndex++;
      const previous = previousIndex >= 0 ? codes[previousIndex]! : undefined;
      const next = nextIndex < codes.length ? codes[nextIndex]! : undefined;
      const joinsBefore = previous !== undefined && canJoinNext(previous) && canJoinPrevious(code);
      const joinsAfter = next !== undefined && canJoinNext(code) && canJoinPrevious(next);
      const form = joiningForm(!joinsBefore,!joinsAfter);
      const record = this.byKey.get(`${code}:${form}`) ?? this.byKey.get(`${code}:${FORM_ANY}`);
      if (!record) return undefined;
      const resolved = this.options.resolver.resolve(record.variant,record.glyphSlot);
      if (!resolved) return undefined;
      logical.push({record,resolved,index});
    }
    if (!logical.length) return undefined;
    const unitsPerEm = this.options.unitsPerEm ?? logical[0]!.resolved.unitsPerEm;
    const glyphs = logical.map(({record,resolved,index}):ShapedGlyph => ({
      id: resolved.glyphId,
      fontId: this.options.fontIds[record.variant] ?? input.font.id,
      cluster: clusterOffset + index,
      // Native form 4 carries marks/ligature pieces without advancing the pen.
      xAdvance: record.form === FORM_ANY ? 0 : resolved.advance * unitsPerEm / resolved.unitsPerEm,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0,
    }));
    return {glyphs:input.direction === "rtl" ? glyphs.reverse() : glyphs,unitsPerEm};
  }
}
