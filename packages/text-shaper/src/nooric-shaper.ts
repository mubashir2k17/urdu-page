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
    if (!codes || codes.length === 0) return this.options.fallback.shape(input);

    const canJoinNext = (code: number): boolean => this.formsByCode.get(code)?.has(FORM_INITIAL) ?? false;

    const logical: { glyph: ShapedGlyph; variant: number }[] = [];
    let unitsPerEm = this.options.unitsPerEm;
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index]!;
      const previous = index > 0 ? codes[index - 1]! : undefined;
      const notJoinPrev = previous === undefined || !canJoinNext(previous);
      const notJoinNext = !canJoinNext(code);
      const form = joiningForm(notJoinPrev, notJoinNext);
      const record =
        this.byKey.get(`${code}:${form}`) ??
        this.byKey.get(`${code}:${FORM_ANY}`);
      if (!record) continue;
      const resolved = this.options.resolver.resolve(record.variant, record.glyphSlot);
      if (!resolved) continue;
      unitsPerEm ??= resolved.unitsPerEm;
      const fontId = this.options.fontIds[record.variant] ?? input.font.id;
      logical.push({
        variant: record.variant,
        glyph: {
          id: resolved.glyphId,
          ...(fontId ? { fontId } : {}),
          cluster: index,
          xAdvance: (resolved.advance * (unitsPerEm ?? resolved.unitsPerEm)) / resolved.unitsPerEm,
          yAdvance: 0,
          xOffset: 0,
          yOffset: 0,
        },
      });
    }

    const resolvedUnits = unitsPerEm ?? 1000;
    const glyphs = input.direction === "rtl" ? logical.reverse().map((entry) => entry.glyph) : logical.map((entry) => entry.glyph);
    return {
      logicalText: input.text,
      fontId: input.font.id,
      direction: input.direction,
      language: input.language,
      script: input.script,
      unitsPerEm: resolvedUnits,
      glyphs,
      totalAdvance: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0),
      missingGlyphCount: glyphs.filter((glyph) => glyph.id === 0).length,
    };
  }
}
