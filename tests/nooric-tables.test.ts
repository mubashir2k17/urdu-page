import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ALTERNATE_RECORD_COUNT,
  DEFAULT_RECORD_COUNT,
  extractNooricTables,
} from "../tools/nooric-table.js";

const candidates = [
  process.env.INPAGE_EXE,
  "C:\\Program Files (x86)\\Nukta Guidance\\Inpage 2018\\Inpage 2018_original.exe",
  "C:\\Program Files\\Nukta Guidance\\Inpage 2018\\Inpage 2018_original.exe",
].filter((candidate): candidate is string => !!candidate && existsSync(candidate));
const source = candidates[0];

describe.skipIf(!source)("vendor NOORIC tables", () => {
  const tables = extractNooricTables(readFileSync(source!));

  it("extracts both 44-byte record tables", () => {
    expect(tables.default.records).toHaveLength(DEFAULT_RECORD_COUNT);
    expect(tables.alternate.records).toHaveLength(ALTERNATE_RECORD_COUNT);
  });

  it("extracts the native selector class tables", () => {
    expect(tables.classes.breakNext[0x20]).toBe(1);
    expect(tables.classes.joinCapable[0x20]).toBe(1);
    expect(tables.classes.joinCapable[0x81]).toBe(1);
    expect(tables.classes.joinCapable[0x82]).toBe(1);
    expect(tables.classes.nonJoining[0x81]).toBe(1);
    expect(tables.classes.nonJoining[0x82]).toBe(0);
    expect(tables.classes.transparent).toContain(0xa8);
    expect(tables.classes.ligatureLeft).toEqual([0x81, 0xc8, 0xc9, 0xca, 0xaf, 0xc8, 0xc9, 0xca, 0xaf, 0x9e]);
    expect(tables.classes.ligatureRight).toEqual([0x9c, 0x9d]);
    expect(tables.classes.rangeA).toEqual([0x82, 0x83, 0x84, 0x85, 0x86, 0xa0, 0xa3, 0xa4, 0xb8, 0xb7, 0xa5, 0xa1, 300, 301, 303]);
  });

  it("keeps record context and type fields for the selector", () => {
    const first = tables.default.records[0]!;
    expect(first.code).toBe(0x81);
    expect(first.context).toEqual([]);
    expect(Number.isInteger(first.type)).toBe(true);
    expect(first.tail).toHaveLength(11);
  });
});
