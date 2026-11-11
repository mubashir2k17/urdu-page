// Portable extraction of the native Noori Character record tables from
// Inpage 2018_original.exe. The binary itself is never committed; callers pass
// its path. See docs/reverse-engineering/noori-shaping.md for the evidence.
//
// The record table lives in the PE `.data` section. Pointers at
// 0x4fef84/0x4fef88/0x4fef8c select the default and alternate tables.

export interface PeSection {
  name: string;
  virtualAddress: number;
  virtualSize: number;
  rawPointer: number;
  rawSize: number;
}

export interface PeImage {
  imageBase: number;
  sections: readonly PeSection[];
  bytes: Uint8Array;
}

export interface NooricRecord {
  index: number;
  /** Legacy second-byte code (+0x00). */
  code: number;
  /** Joining form: 0 isolated, 1 final, 2 medial, 3 initial, 4 any. (+0x02) */
  form: number;
  /** NOORIC sub-variant 0..2 (+0x04); native face code = variant + bias + 0xea. */
  variant: number;
  s06: number;
  s08: number;
  s0a: number;
  /** Signed pen/offset (+0x0c). */
  advance: number;
  /** Context codes (+0x10 pointer), 0x80-terminated in the binary. */
  context: readonly number[];
  /** Form/type class (+0x14). */
  type: number;
  /** Remaining eleven int16 fields (+0x16..+0x2a). */
  tail: readonly number[];
}

export interface NooricTable {
  kind: "default" | "alternate";
  address: number;
  records: readonly NooricRecord[];
}

export interface NooricTables {
  imageBase: number;
  default: NooricTable;
  alternate: NooricTable;
  /** Per-variant (3) x slot (256) advance widths for the NOORIC face family. */
  nooricWidths: readonly (readonly number[])[];
}

export const RECORD_SIZE = 44;
/** `0x443` records for the default table (FUN_004125b0 bound). */
export const DEFAULT_RECORD_COUNT = 0x443;
/** `0x43f` records for the alternate table. */
export const ALTERNATE_RECORD_COUNT = 0x43f;
export const DEFAULT_POINTER_VA = 0x4fef8c;
export const ALTERNATE_POINTER_VA = 0x4fef88;
/** `(&DAT_0064ab3c)[3]` — NOORIC (face family 3) advance-width table pointer. */
export const NOORIC_WIDTH_POINTER_VA = 0x64ab48;
export const NOORIC_VARIANTS = 3;
export const NOORIC_SLOTS = 256;
const CONTEXT_TERMINATOR = 0x80;
const MAX_CONTEXT_ENTRIES = 256;

function u16(bytes: Uint8Array, o: number): number {
  return bytes[o]! | (bytes[o + 1]! << 8);
}
function i16(bytes: Uint8Array, o: number): number {
  const value = u16(bytes, o);
  return value >= 0x8000 ? value - 0x10000 : value;
}
function u32(bytes: Uint8Array, o: number): number {
  return (bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)) >>> 0;
}
function i32(bytes: Uint8Array, o: number): number {
  return u32(bytes, o) | 0;
}

export function parsePe(bytes: Uint8Array): PeImage {
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error("Not a PE image (missing MZ)");
  const peOffset = u32(bytes, 0x3c);
  if (
    bytes[peOffset] !== 0x50 ||
    bytes[peOffset + 1] !== 0x45 ||
    bytes[peOffset + 2] !== 0 ||
    bytes[peOffset + 3] !== 0
  ) {
    throw new Error("Not a PE image (missing PE signature)");
  }
  const numberOfSections = u16(bytes, peOffset + 6);
  const optionalSize = u16(bytes, peOffset + 20);
  const optionalOffset = peOffset + 24;
  const imageBase = u32(bytes, optionalOffset + 28);
  const sectionOffset = optionalOffset + optionalSize;
  const sections: PeSection[] = [];
  for (let index = 0; index < numberOfSections; index++) {
    const base = sectionOffset + index * 40;
    const rawName = bytes.subarray(base, base + 8);
    const name = String.fromCharCode(...rawName).replace(/\0+$/, "");
    sections.push({
      name,
      virtualSize: u32(bytes, base + 8),
      virtualAddress: u32(bytes, base + 12),
      rawSize: u32(bytes, base + 16),
      rawPointer: u32(bytes, base + 20),
    });
  }
  return { imageBase, sections, bytes };
}

export function vaToOffset(image: PeImage, va: number): number {
  const rva = va - image.imageBase;
  for (const section of image.sections) {
    const span = Math.max(section.virtualSize, section.rawSize);
    if (rva >= section.virtualAddress && rva < section.virtualAddress + span) {
      const delta = rva - section.virtualAddress;
      if (delta >= section.rawSize) {
        throw new Error(
          `VA 0x${va.toString(16)} falls in uninitialized part of ${section.name}`,
        );
      }
      return section.rawPointer + delta;
    }
  }
  throw new Error(`VA 0x${va.toString(16)} is outside every section`);
}

function readPointer(image: PeImage, va: number): number {
  return u32(image.bytes, vaToOffset(image, va));
}

function readContextList(image: PeImage, va: number): number[] {
  if (va === 0) return [];
  const offset = vaToOffset(image, va);
  const values: number[] = [];
  for (let index = 0; index < MAX_CONTEXT_ENTRIES; index++) {
    const value = u16(image.bytes, offset + index * 2);
    if (value === CONTEXT_TERMINATOR) return values;
    values.push(value);
  }
  throw new Error(`Unterminated context list at VA 0x${va.toString(16)}`);
}

function readRecord(image: PeImage, tableVa: number, index: number): NooricRecord {
  const offset = vaToOffset(image, tableVa + index * RECORD_SIZE);
  const bytes = image.bytes;
  const tail: number[] = [];
  for (let field = 0; field < 11; field++) {
    tail.push(i16(bytes, offset + 0x16 + field * 2));
  }
  return {
    index,
    code: i16(bytes, offset + 0x00),
    form: i16(bytes, offset + 0x02),
    variant: i16(bytes, offset + 0x04),
    s06: i16(bytes, offset + 0x06),
    s08: i16(bytes, offset + 0x08),
    s0a: i16(bytes, offset + 0x0a),
    advance: i32(bytes, offset + 0x0c),
    context: readContextList(image, u32(bytes, offset + 0x10)),
    type: i16(bytes, offset + 0x14),
    tail,
  };
}

function readTable(
  image: PeImage,
  kind: NooricTable["kind"],
  tableVa: number,
  count: number,
): NooricTable {
  const records: NooricRecord[] = [];
  for (let index = 0; index < count; index++) records.push(readRecord(image, tableVa, index));
  return { kind, address: tableVa, records };
}

function readNooricWidths(image: PeImage): number[][] {
  let table: number;
  try {
    table = readPointer(image, NOORIC_WIDTH_POINTER_VA);
  } catch {
    // Pointer lives in uninitialized .data; populated at runtime from DAT.
    return [];
  }
  if (!table) return [];
  const variants: number[][] = [];
  try {
    for (let variant = 0; variant < NOORIC_VARIANTS; variant++) {
      const row: number[] = [];
      for (let slot = 0; slot < NOORIC_SLOTS; slot++) {
        row.push(u16(image.bytes, vaToOffset(image, table + (variant * NOORIC_SLOTS + slot) * 2)));
      }
      variants.push(row);
    }
  } catch {
    return [];
  }
  return variants;
}

export function extractNooricTables(bytes: Uint8Array): NooricTables {
  const image = parsePe(bytes);
  return {
    imageBase: image.imageBase,
    default: readTable(
      image,
      "default",
      readPointer(image, DEFAULT_POINTER_VA),
      DEFAULT_RECORD_COUNT,
    ),
    alternate: readTable(
      image,
      "alternate",
      readPointer(image, ALTERNATE_POINTER_VA),
      ALTERNATE_RECORD_COUNT,
    ),
    nooricWidths: readNooricWidths(image),
  };
}

/** Glyph slot rendered for a record: the emitter draws the byte at record+6. */
export function glyphSlot(record: NooricRecord): number {
  return record.s06 & 0xff;
}

/** Advance width for a record's variant/slot, from the native width table. */
export function advanceWidth(
  tables: NooricTables,
  record: NooricRecord,
): number | undefined {
  const row = tables.nooricWidths[record.variant];
  return row?.[glyphSlot(record)];
}

export function formHistogram(table: NooricTable): Map<number, number> {
  const histogram = new Map<number, number>();
  for (const record of table.records) {
    histogram.set(record.form, (histogram.get(record.form) ?? 0) + 1);
  }
  return histogram;
}

export function formsForCode(table: NooricTable, code: number): Set<number> {
  const forms = new Set<number>();
  for (const record of table.records) if (record.code === code) forms.add(record.form);
  return forms;
}

export function distinctCodes(table: NooricTable): Set<number> {
  return new Set(table.records.map((record) => record.code));
}
