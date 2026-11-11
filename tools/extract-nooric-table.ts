// Extract the native Noori Character record tables from an InPage executable.
//
// Usage:
//   npm run nooric:extract -- "<path to Inpage 2018_original.exe>" [--output <json>]
//
// The EXE is read-only; only derived table data is written (default under the
// gitignored tmp/ directory). See docs/reverse-engineering/noori-shaping.md.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { distinctCodes, extractNooricTables, formHistogram } from "./nooric-table.js";

const source = process.argv[2];
if (!source || source.startsWith("--")) {
  throw new Error('Usage: npm run nooric:extract -- "<path to Inpage 2018_original.exe>" [--output <json>]');
}

const outputIndex = process.argv.indexOf("--output");
const output = resolve(
  outputIndex >= 0 ? process.argv[outputIndex + 1] ?? "" : "tmp/reverse-engineering/nooric-tables.json",
);
if (!output) throw new Error("--output requires a path");

const bytes = readFileSync(resolve(source));
const tables = extractNooricTables(bytes);

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(tables, null, 2)}\n`, "utf8");

for (const table of [tables.default, tables.alternate]) {
  const histogram = [...formHistogram(table).entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([form, count]) => `${form}:${count}`)
    .join(" ");
  console.log(
    `${table.kind} @0x${table.address.toString(16)}: ${table.records.length} records, ` +
      `${distinctCodes(table).size} codes, forms ${histogram}`,
  );
}
const widths = tables.nooricWidths;
if (widths.length === 0) {
  console.log("nooric widths: runtime-initialized in .data; not statically extractable");
} else {
  console.log(
    `nooric widths: ${widths.length} variants x ${widths[0]?.length ?? 0} slots, ` +
      `${widths.flat().filter((value) => value !== 0).length} nonzero`,
  );
}
console.log(`Wrote ${output}`);
