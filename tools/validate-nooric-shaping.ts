// Validation harness for the recovered Noori shaping model.
//
// Usage:
//   npm run nooric:validate -- "<path to Inpage 2018_original.exe>"
//   npm run nooric:validate -- --json tmp/reverse-engineering/nooric-tables.json
//
// Checks structural facts about the extracted record tables and the ported
// form/lookup logic. Exit code is non-zero on any failure.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  advanceWidth,
  ALTERNATE_RECORD_COUNT,
  DEFAULT_RECORD_COUNT,
  distinctCodes,
  extractNooricTables,
  formHistogram,
  formsForCode,
  glyphSlot,
  type NooricTables,
} from "./nooric-table.js";
import {
  encodeOutputCode,
  findFirstRecord,
  firstRecord,
  formFromJoining,
  faceFamily,
  FORM_FINAL,
  FORM_INITIAL,
  FORM_ISOLATED,
  FORM_MEDIAL,
} from "./nooric-shaping.js";

const jsonIndex = process.argv.indexOf("--json");
let tables: NooricTables;
if (jsonIndex >= 0) {
  const path = process.argv[jsonIndex + 1];
  if (!path) throw new Error("--json requires a path");
  tables = JSON.parse(readFileSync(resolve(path), "utf8")) as NooricTables;
} else {
  const source = process.argv[2];
  if (!source || source.startsWith("--")) {
    throw new Error(
      'Usage: npm run nooric:validate -- "<path to Inpage 2018_original.exe>" | --json <tables.json>',
    );
  }
  tables = extractNooricTables(readFileSync(resolve(source)));
}

let failures = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}

function histogramOf(table: NooricTables["default"]): string {
  return [...formHistogram(table).entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([form, count]) => `${form}:${count}`)
    .join(",");
}

// --- Table structure -------------------------------------------------------

check(
  "default record count",
  tables.default.records.length === DEFAULT_RECORD_COUNT,
  `got ${tables.default.records.length}`,
);
check(
  "alternate record count",
  tables.alternate.records.length === ALTERNATE_RECORD_COUNT,
  `got ${tables.alternate.records.length}`,
);
check(
  "default distinct code count",
  distinctCodes(tables.default).size === 154,
  `got ${distinctCodes(tables.default).size}`,
);
check(
  "default form histogram",
  histogramOf(tables.default) === "0:116,1:71,2:436,3:429,4:39",
  histogramOf(tables.default),
);
check(
  "alternate form histogram",
  histogramOf(tables.alternate) === "0:116,1:71,2:432,3:429,4:39",
  histogramOf(tables.alternate),
);

for (const table of [tables.default, tables.alternate]) {
  let sorted = true;
  for (let index = 1; index < table.records.length; index++) {
    const previous = table.records[index - 1]!;
    const current = table.records[index]!;
    if (previous.code > current.code) sorted = false;
    else if (previous.code === current.code && previous.form > current.form) sorted = false;
    if (!sorted) break;
  }
  check(`${table.kind} records sorted by (code, form)`, sorted);
  check(
    `${table.kind} forms within 0..4`,
    table.records.every((record) => record.form >= 0 && record.form <= 4),
  );
}

// --- Joining behaviour -----------------------------------------------------

const nonJoining = [0x81, 0x8b, 0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x91];
check(
  "non-joining letters expose only forms 0/1",
  nonJoining.every((code) => {
    const forms = formsForCode(tables.default, code);
    return forms.size > 0 && [...forms].every((form) => form === 0 || form === 1);
  }),
);
const joining = [0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a];
check(
  "joining letters expose forms 0..3",
  joining.every((code) => {
    const forms = formsForCode(tables.default, code);
    return [0, 1, 2, 3].every((form) => forms.has(form));
  }),
);

check(
  "form truth table",
  formFromJoining(true, true) === FORM_ISOLATED &&
    formFromJoining(true, false) === FORM_INITIAL &&
    formFromJoining(false, true) === FORM_FINAL &&
    formFromJoining(false, false) === FORM_MEDIAL,
);

// --- Lookup and encoding ---------------------------------------------------

check("lookup 0x81/0 -> 0", findFirstRecord(tables.default, 0x81, 0) === 0);
check("lookup 0x81/1 -> 1", findFirstRecord(tables.default, 0x81, 1) === 1);
check("lookup 0x82/0 -> 3", findFirstRecord(tables.default, 0x82, 0) === 3);
check("lookup 0x82/2 -> 6", findFirstRecord(tables.default, 0x82, 2) === 6);
check("lookup missing form 0x81/2 -> -1", findFirstRecord(tables.default, 0x81, 2) === -1);

const record0 = firstRecord(tables.default, 0x81, 0);
const record3 = firstRecord(tables.default, 0x82, 0);
if (!record0 || !record3) {
  check("golden records exist", false);
} else {
  const encoded0 = encodeOutputCode(record0);
  const encoded3 = encodeOutputCode(record3);
  check("encode record 0 faceCode", encoded0.faceCode === 0xea, `got 0x${encoded0.faceCode.toString(16)}`);
  check("encode record 0 tokenCode", encoded0.tokenCode === 0x21, `got 0x${encoded0.tokenCode.toString(16)}`);
  check("encode record 3 faceCode", encoded3.faceCode === 0xeb, `got 0x${encoded3.faceCode.toString(16)}`);
  check("encode record 3 tokenCode", encoded3.tokenCode === 0x24, `got 0x${encoded3.tokenCode.toString(16)}`);
  check("face 0xea is NOORIC group 0", faceFamily(0xea) === "NOORIC0", faceFamily(0xea));
  check("face 0xeb is NOORIC group 0 +1", faceFamily(0xeb) === "NOORIC0+1", faceFamily(0xeb));
  console.log(
    `info 0x81/0 -> ${faceFamily(encoded0.faceCode)} token 0x${encoded0.tokenCode.toString(16)}; ` +
      `0x82/0 -> ${faceFamily(encoded3.faceCode)} token 0x${encoded3.tokenCode.toString(16)}`,
  );
}

// --- Width table and glyph slot --------------------------------------------

if (tables.nooricWidths.length === 0) {
  console.log("info NOORIC width table is runtime-initialized in .data; not statically extracted");
} else {
  check(
    "NOORIC width table shape (3 x 256)",
    tables.nooricWidths.length === 3 && tables.nooricWidths.every((row) => row.length === 256),
    `${tables.nooricWidths.length} x ${tables.nooricWidths[0]?.length ?? 0}`,
  );
  const nonzeroWidths = tables.nooricWidths.flat().filter((width) => width !== 0).length;
  check("NOORIC width table populated", nonzeroWidths > 0, `${nonzeroWidths} nonzero of 768`);
}

if (record0) {
  check("glyph slot is record+6 low byte", glyphSlot(record0) === (record0.s06 & 0xff));
  if (tables.nooricWidths.length > 0) {
    const width = advanceWidth(tables, record0);
    check("advance width resolves", width !== undefined, `got ${width}`);
  }
}

// --- Cross-table -----------------------------------------------------------

const defaultCodes = distinctCodes(tables.default);
const alternateCodes = distinctCodes(tables.alternate);
check(
  "default and alternate share the code set",
  defaultCodes.size === alternateCodes.size &&
    [...defaultCodes].every((code) => alternateCodes.has(code)),
);

// --- Summary ---------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log("\nAll Noori shaping checks passed");
}
