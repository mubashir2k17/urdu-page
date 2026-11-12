// Character-level Noori (NOORIC) shaper, ported from the native selector
// (FUN_00413060), emitter (FUN_0040a2a0), and range rewrite (FUN_00412eb0).
// It consumes legacy InPage codes, computes joining forms from the native class
// tables, selects context-sensitive 44-byte records, and emits positioned
// glyphs. Glyph resolution is injected so this module stays independent of the
// vendor font files and of the tools that extract the record table.
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
  /** Signed pen/offset from record+0x0c. */
  advance?: number;
  /** Context codes from record+0x10, terminated by 0x80 in the native image. */
  context?: readonly number[];
  /** Form/type class from record+0x14; final records only match a form. */
  type?: number;
  /** Remaining int16 fields at record+0x16..+0x2a. */
  tail?: readonly number[];
}

/**
 * Static class tables used by the native selector (FUN_00413060) and the
 * range rewriter (FUN_004127c0). Byte tables are indexed by legacy code; list
 * tables are 0x80-terminated shorts compared by their low byte.
 */
export interface NooricClassTables {
  /** 0x4e70b8: a non-zero next code terminates the joining run. */
  breakNext: readonly number[];
  /** 0x4e71b8: codes that participate in joining (letters and punctuation). */
  joinCapable: readonly number[];
  /** 0x4e72b8: right-joining letters that do not connect forward. */
  nonJoining: readonly number[];
  /** 0x4e78bc: combining marks ignored while looking for neighbours. */
  transparent: readonly number[];
  /** 0x4e775c: left side of the native ligature pair test. */
  ligatureLeft: readonly number[];
  /** 0x4e7584: right side of the native ligature pair test. */
  ligatureRight: readonly number[];
  /** Context target lists used by the range rewrite. */
  rangeBreak: readonly number[];       // 0x4e7644
  rangeA: readonly number[];           // 0x4e73b8
  rangeB: readonly number[];           // 0x4e745c
  rangeC: readonly number[];           // 0x4e74ac
  rangeD: readonly number[];           // 0x4e74b8
  rangeE: readonly number[];           // 0x4e74bc
  rangeF: readonly number[];           // 0x4e74c8
  rangeG: readonly number[];           // 0x4e74f8
  rangeH: readonly number[];           // 0x4e7534
  rangeI: readonly number[];           // 0x4e7608
  rangeJ: readonly number[];           // 0x4e7828
  rangeK: readonly number[];           // 0x4e7880
  rangeL: readonly number[];           // 0x4e7888
  rangeM: readonly number[];           // 0x4e7890
  rangeN: readonly number[];           // 0x4e78ec
  rangeO: readonly number[];           // 0x4e7908
}

export interface ResolvedGlyph {
  glyphId: number;
  advance: number;
  unitsPerEm: number;
}

export interface NooricGlyphResolver {
  resolve(variant: number, slot: number): ResolvedGlyph | undefined;
  /**
   * Optional face-aware resolution. `faceIndex` is the native face code minus
   * 0xea, i.e. `variant + styleBias`; it lets a bold/bias run select a
   * different NOORIC group without changing the record table.
   */
  resolveFace?(faceIndex: number, slot: number): ResolvedGlyph | undefined;
}

export interface NooricTextShaperOptions {
  records: readonly NooricRecord[];
  resolver: NooricGlyphResolver;
  /** Font id per variant index. Used when no face-aware mapping is supplied. */
  fontIds: readonly string[];
  /** Used when input codes are absent. */
  fallback: TextShaper;
  /** Normalized run units; defaults to the first resolved glyph's em. */
  unitsPerEm?: number;
  /** Native selector class tables. Without them the legacy form heuristic runs. */
  classes?: NooricClassTables;
  /** Per-face advance rows (3 or 9 rows x 256 slots); row[0] is the denominator. */
  advanceTable?: readonly (readonly number[])[];
  /** Native style bias (DAT_0064a0a8): 0 regular, 3 for the first bold step. */
  styleBias?: number;
  /** Optional font id per `faceIndex` (variant + styleBias). */
  faceFontIds?: readonly string[];
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

function byteFlag(table: readonly number[] | undefined, code: number): boolean {
  return !!table && (table[code & 0xff] ?? 0) !== 0;
}

function listHas(list: readonly number[] | undefined, code: number): boolean {
  return !!list && list.some((value) => (value & 0xff) === (code & 0xff));
}

function sameList(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if ((left[index]! & 0xff) !== (right[index]! & 0xff)) return false;
  }
  return true;
}

interface IndexedRecord {
  record: NooricRecord;
  index: number;
}

interface SelectedRecord {
  record: NooricRecord;
  index: number;
  cluster: number;
}

export class NooricTextShaper implements TextShaper {
  private readonly records: readonly NooricRecord[];
  private readonly byKey = new Map<string, IndexedRecord>();
  private readonly byCode = new Map<number, IndexedRecord[]>();
  private readonly formsByCode = new Map<number, Set<number>>();
  private readonly options: NooricTextShaperOptions;

  constructor(options: NooricTextShaperOptions) {
    this.options = options;
    this.records = options.records;
    for (const [index, record] of options.records.entries()) {
      if (!Number.isInteger(record.code) || !Number.isInteger(record.form)) {
        throw new Error("Invalid Nooric record");
      }
      const entry = { record, index };
      const key = `${record.code}:${record.form}`;
      if (!this.byKey.has(key)) this.byKey.set(key, entry);
      let candidates = this.byCode.get(record.code);
      if (!candidates) {
        candidates = [];
        this.byCode.set(record.code, candidates);
      }
      candidates.push(entry);
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

  private isTransparent(code: number): boolean {
    const classes = this.options.classes;
    if (classes) return listHas(classes.transparent, code);
    const forms = this.formsByCode.get(code);
    return !!forms?.size && [...forms].every(form => form === FORM_ANY);
  }

  private previousSignificantCode(codes: readonly number[], index: number): number {
    for (let candidate = index - 1; candidate >= 0; candidate--) {
      if (!this.isTransparent(codes[candidate]!)) return codes[candidate]!;
    }
    // FUN_00412660 returns a space when no predecessor exists.
    return 0x20;
  }

  private nextSignificantCode(codes: readonly number[], index: number): number {
    for (let candidate = index + 1; candidate < codes.length; candidate++) {
      if (!this.isTransparent(codes[candidate]!)) return codes[candidate]!;
    }
    // FUN_004126a0 returns a space when no successor exists.
    return 0x20;
  }

  /**
   * Native joining form computation (FUN_00413060). The class tables encode
   * join capability directly; without them the recovered forms-per-code
   * heuristic remains as a fallback for older extracted tables.
   */
  private computeForms(codes: readonly number[], styleBias: number): number[] {
    const classes = this.options.classes;
    const forms: number[] = [];
    let notJoinPrev = true;
    let lastBoundary = 0;
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index]!;
      let notJoinNext = false;
      if (classes) {
        const next = codes[index + 1];
        if (!byteFlag(classes.joinCapable, code) && notJoinPrev && !this.isTransparent(code)) {
          notJoinNext = true;
        }
        if (next !== undefined) {
          if (byteFlag(classes.breakNext, next) ||
              (byteFlag(classes.nonJoining, code) && !this.isTransparent(next))) {
            notJoinNext = true;
          }
        } else if (byteFlag(classes.nonJoining, code)) {
          notJoinNext = true;
        }

        // The native selector pads sub-0x81 codes before the class test; the
        // helper compares only the low byte, so this is equivalent.
        const padded = code < 0x81 && code !== 0x20 ? code + 0x100 : code;
        if (!byteFlag(classes.joinCapable, code) && (!this.isTransparent(padded) || notJoinPrev)) {
          notJoinNext = true;
          forms.push(FORM_ISOLATED);
        } else {
          const remaining = codes.length - index;
          if (remaining < 2 ||
              (!notJoinNext && remaining > 2 &&
               (index - lastBoundary > 0x2d || this.isWordBoundary(codes, index, styleBias)))) {
            notJoinNext = true;
          }
          forms.push(joiningForm(notJoinPrev, notJoinNext));
        }
      } else {
        const previous = index > 0 && !this.isTransparent(codes[index - 1]!) ? codes[index - 1] : undefined;
        const next = index + 1 < codes.length && !this.isTransparent(codes[index + 1]!)
          ? codes[index + 1] : undefined;
        const joinsBefore = previous !== undefined &&
          (this.formsByCode.get(previous)?.has(FORM_INITIAL) ?? false) &&
          (this.formsByCode.get(code)?.has(FORM_FINAL) ?? false);
        const joinsAfter = next !== undefined &&
          (this.formsByCode.get(code)?.has(FORM_INITIAL) ?? false) &&
          (this.formsByCode.get(next)?.has(FORM_FINAL) ?? false);
        notJoinNext = !joinsAfter;
        forms.push(joiningForm(!joinsBefore, notJoinNext));
      }
      if (notJoinNext || code === 0x20) lastBoundary = index + 1;
      notJoinPrev = notJoinNext;
    }
    return forms;
  }

  /** Port of FUN_00412fd0: a word boundary in the middle of a joining run. */
  private isWordBoundary(codes: readonly number[], index: number, styleBias: number): boolean {
    const classes = this.options.classes;
    if (!classes) return false;
    for (let candidate = index + 1; candidate < codes.length; candidate++) {
      const code = codes[candidate]!;
      if ((code === 0x96 && styleBias === 0) || this.isTransparent(code)) {
        if (code !== 0xa3 && code !== 0xbf) {
          const next = codes[candidate + 1];
          return next === undefined || next > 0xca || next === 0x20 ||
            !byteFlag(classes.joinCapable, next);
        }
      }
    }
    return true;
  }

  /**
   * Context-sensitive record walk (FUN_00413060 steps 2-3). A record with a
   * context list is accepted only when the previous (final form) or next
   * (other forms) significant code appears in that list.
   */
  private selectRecord(
    code: number,
    form: number,
    contextCode: number,
    previousRecord: NooricRecord | undefined,
  ): IndexedRecord | undefined {
    const candidates = this.byCode.get(code);
    if (!candidates) return undefined;
    for (const entry of candidates) {
      const record = entry.record;
      if (record.form !== form && record.form !== FORM_ANY) continue;
      if (form === FORM_FINAL && record.type) {
        if (!previousRecord || previousRecord.form !== record.type) continue;
      }
      if (record.context && record.context.length > 0 &&
          !record.context.some((value) => (value & 0xff) === (contextCode & 0xff))) {
        continue;
      }
      return entry;
    }
    return this.byKey.get(`${code}:${form}`) ?? this.byKey.get(`${code}:${FORM_ANY}`) ?? candidates[0];
  }

  private shapeCodedSegment(
    input: ShapeInput,
    codes: readonly number[],
    clusterOffset: number,
  ): {glyphs:ShapedGlyph[];unitsPerEm:number} | undefined {
    const styleBias = input.styleBias ?? this.options.styleBias ?? 0;
    const forms = this.computeForms(codes, styleBias);
    const selected: SelectedRecord[] = [];
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index]!;
      const form = forms[index]!;
      const previousSignificant = this.previousSignificantCode(codes, index);
      const nextSignificant = this.nextSignificantCode(codes, index);
      const contextCode = form === FORM_FINAL ? previousSignificant : nextSignificant;
      let previousRecord: NooricRecord | undefined;
      for (let prior = index - 1; prior >= 0; prior--) {
        if (!this.isTransparent(codes[prior]!)) {
          previousRecord = selected[prior]?.record;
          break;
        }
      }
      const entry = this.selectRecord(code, form, contextCode, previousRecord);
      if (!entry) return undefined;
      selected.push({ record: entry.record, index: entry.index, cluster: clusterOffset + index });
    }
    if (!selected.length) return undefined;

    // Native post-pass: class-driven range rewrites, then final resolution.
    this.applyLigaturePostPass(selected);

    let unitsPerEm: number | undefined;
    const glyphs: ShapedGlyph[] = [];
    for (const item of selected) {
      const record = item.record;
      const faceIndex = record.variant + styleBias;
      const resolved = this.options.resolver.resolveFace?.(faceIndex, record.glyphSlot) ??
        this.options.resolver.resolve(record.variant, record.glyphSlot);
      if (!resolved) return undefined;
      unitsPerEm ??= this.options.unitsPerEm ?? resolved.unitsPerEm;
      const fontId = this.options.faceFontIds?.[faceIndex] ??
        this.options.fontIds[record.variant] ?? input.font.id;
      const advance = this.glyphAdvance(record, faceIndex, resolved, unitsPerEm);
      glyphs.push({
        id: resolved.glyphId,
        fontId,
        cluster: item.cluster,
        // Native form 4 carries marks/ligature pieces without advancing the pen.
        xAdvance: record.form === FORM_ANY ? 0 : advance,
        yAdvance: 0,
        xOffset: 0,
        yOffset: 0,
      });
    }
    if (unitsPerEm === undefined) return undefined;
    return {glyphs: input.direction === "rtl" ? glyphs.reverse() : glyphs, unitsPerEm};
  }

  private glyphAdvance(
    record: NooricRecord,
    faceIndex: number,
    resolved: ResolvedGlyph,
    unitsPerEm: number,
  ): number {
    const row = this.options.advanceTable?.[faceIndex];
    const denominator = row?.[0] ?? resolved.unitsPerEm;
    const width = row?.[record.glyphSlot];
    if (row && width !== undefined && width !== 0 && denominator > 0) {
      return width * unitsPerEm / denominator;
    }
    return resolved.advance * unitsPerEm / resolved.unitsPerEm;
  }

  /**
   * Class-driven range rewrite. This ports the decoded subset of
   * FUN_00413060's trailing scan plus FUN_00412eb0: when a ligature pair or a
   * boundary glyph is found, the token is advanced to the same-code record
   * whose context list is the native target range. The remaining branches of
   * FUN_004127c0 that depend on unpublished mark metrics stay unchanged; they
   * are tracked in docs/reverse-engineering/noori-shaping.md.
   */
  private applyLigaturePostPass(tokens: SelectedRecord[]): void {
    const classes = this.options.classes;
    if (!classes) return;
    // FUN_00413060 only runs the trailing scan when the emitted run is longer
    // than five tokens (`4 < local_5c - 1`).
    if (tokens.length <= 5) return;
    for (let index = tokens.length - 1; index >= 0; index--) {
      const current = tokens[index]!;
      if (current.record.code === 0x20) continue;
      const previous = this.previousSignificantToken(tokens, index);
      if (previous < 0) continue;
      if (tokens[previous]!.record.code === 0x20) continue;
      const beforePrevious = this.previousSignificantToken(tokens, previous);
      if (beforePrevious < 0) continue;

      if (listHas(classes.ligatureLeft, current.record.code) &&
          listHas(classes.ligatureRight, tokens[previous]!.record.code)) {
        const anchor = tokens[beforePrevious]!;
        if (anchor.record.code === 0x20) continue;
        if (anchor.record.form !== FORM_INITIAL && anchor.record.form !== FORM_MEDIAL) continue;
        this.rewriteToRange(tokens, beforePrevious);
        continue;
      }
      if (listHas(classes.transparent, current.record.code)) continue;
      if (listHas(classes.rangeO, current.record.code)) {
        this.rewriteToRange(tokens, index);
      }
    }
  }

  private previousSignificantToken(tokens: readonly SelectedRecord[], index: number): number {
    for (let candidate = index - 1; candidate >= 0; candidate--) {
      if (!this.isTransparent(tokens[candidate]!.record.code)) return candidate;
    }
    return -1;
  }

  /** FUN_00412eb0: move a token to the record carrying a target context list. */
  private rewriteToRange(tokens: SelectedRecord[], index: number): void {
    const current = tokens[index]!;
    const target = this.rangeTarget(current.record);
    if (!target) return;
    const replacement = this.byCode.get(current.record.code)
      ?.find(entry => sameList(entry.record.context, target));
    if (replacement) {
      tokens[index] = {...current, record: replacement.record, index: replacement.index};
    }
  }

  private rangeTarget(record: NooricRecord): readonly number[] | undefined {
    const classes = this.options.classes;
    if (!classes) return undefined;
    switch (record.code) {
      case 0x92:
      case 0x93:
        return classes.rangeH;
      case 0x98:
      case 0x99:
      case 0xa6:
        return classes.rangeG;
      case 0xa7:
        return classes.rangeJ;
      default:
        if (listHas(classes.rangeA, record.code)) {
          return record.form === FORM_INITIAL ? classes.rangeD : classes.rangeG;
        }
        return classes.rangeG;
    }
  }
}
