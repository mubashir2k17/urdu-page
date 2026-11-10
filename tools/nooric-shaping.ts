// Port of the native Noori selection core: joining-form computation, the
// (code, form) record lookup (FUN_004125b0 / FUN_00415bf0), and the output
// code-token encoding (FUN_00413060). Context-class matching and the ligature
// post-pass are not ported yet; see docs/reverse-engineering/noori-shaping.md.

import type { NooricRecord, NooricTable } from "./nooric-table.js";

export const FORM_ISOLATED = 0;
export const FORM_FINAL = 1;
export const FORM_MEDIAL = 2;
export const FORM_INITIAL = 3;
export const FORM_ANY = 4;

/**
 * Native form selection (FUN_00413060). Two flags track non-joining:
 * `notJoinPrev` blocks a connection to the previous glyph, `notJoinNext`
 * blocks a connection to the next glyph. This matches standard Arabic joining.
 */
export function formFromJoining(notJoinPrev: boolean, notJoinNext: boolean): number {
  if (notJoinPrev) return notJoinNext ? FORM_ISOLATED : FORM_INITIAL;
  return notJoinNext ? FORM_FINAL : FORM_MEDIAL;
}

/**
 * First record with `(code, form)`, or -1. Records are sorted by code then form,
 * so this mirrors the native binary search in FUN_00415bf0.
 */
export function findFirstRecord(table: NooricTable, code: number, form: number): number {
  let low = 0;
  let high = table.records.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const record = table.records[middle]!;
    if (record.code < code || (record.code === code && record.form < form)) low = middle + 1;
    else high = middle;
  }
  const record = table.records[low];
  return record && record.code === code && record.form === form ? low : -1;
}

export function firstRecord(
  table: NooricTable,
  code: number,
  form: number,
): NooricRecord | undefined {
  const index = findFirstRecord(table, code, form);
  return index < 0 ? undefined : table.records[index];
}

/**
 * Native output code token for a selected record (FUN_00413060):
 * `faceCode = record.variant + styleBias + 0xea`, `tokenCode = index + 0x21`.
 * The face code selects a font family in FUN_00405870 (`faceIndex = faceCode - 0x80`);
 * the glyph identity is carried by record fields, not `tokenCode`.
 */
export interface EncodedCode {
  faceCode: number;
  tokenCode: number;
}

export function encodeOutputCode(record: NooricRecord, styleBias = 0): EncodedCode {
  return {
    faceCode: (record.variant + styleBias + 0xea) & 0xffff,
    tokenCode: (record.index + 0x21) & 0xffff,
  };
}

/**
 * Approximate face family for a face code, mirroring FUN_00405870 branches:
 * NOORIN < 0x66, ZoharSindhi 0x66..0x69, NOORIC 0x6a..0x6f (variant groups of
 * three), Quranic 0x70..0xc9, Number >= 0xca. Used for diagnostics, not glyph ids.
 */
export function faceFamily(faceCode: number): string {
  const index = (faceCode - 0x80) & 0xffff;
  if (index >= 0xca) return `Number${index - 0xca}`;
  if (index >= 0x70) return `Quranic${index - 0x70}`;
  if (index >= 0x6a) {
    const slot = index - 0x6a;
    return `NOORIC${Math.floor(slot / 3)}${slot % 3 ? `+${slot % 3}` : ""}`;
  }
  if (index >= 0x66) return `ZoharSindhi${index - 0x66}`;
  if (index > 99) return `Family${index - 100}`;
  return `NOORIN${String(index).padStart(2, "0")}`;
}
