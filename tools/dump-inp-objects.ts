// Dump the property tag stream of selected v1 drawing/text records. Diagnostic
// tool for recovering the record grammar; see docs/reverse-engineering/drawing-records.md.
//
// Usage:
//   npm run dump:objects -- <file.inp> [ids,comma,separated]

import { readFileSync } from "node:fs";

import { readCfb } from "@inpage/cfb";
import { openInPage } from "@inpage/inp-parser";

const path = process.argv[2];
if (!path) throw new Error("Usage: npm run dump:objects -- <file.inp> [ids]");
const wanted = new Set((process.argv[3] ?? "34,35,38,48,50,51,56").split(",").map(Number));

const bytes = readFileSync(path);
const data = readCfb(bytes).byPath.get("InPage100")!.bytes;
const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

// Keys whose 0x7e value is 4 bytes. Everything else in the observed stream is a
// 2-byte value. Derived from payload inspection, not from a decoded table.
const WIDE_KEYS = new Set([0x00, 0x01, 0x02, 0x03, 0x05, 0x1a, 0x1b, 0x1c]);

function hex(payload: Uint8Array, limit = 256): string {
  const lines: string[] = [];
  for (let offset = 0; offset < Math.min(payload.length, limit); offset += 16) {
    const slice = payload.subarray(offset, offset + 16);
    const hexPart = [...slice].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    const ascii = [...slice].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".")).join("");
    lines.push(`    ${offset.toString(16).padStart(4, "0")}  ${hexPart.padEnd(47)}  ${ascii}`);
  }
  return lines.join("\n");
}

interface Entry {
  key: number;
  group: number;
  width: number;
  value: number;
  offset: number;
}

function entries(payload: Uint8Array): Entry[] {
  const out: Entry[] = [];
  const dataView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  // The observed payload begins with a 6-byte prefix (80 00 ff ff ff ff).
  let offset = 6;
  while (offset + 3 <= payload.length) {
    const key = payload[offset]!;
    const group = payload[offset + 1]!;
    const width = group === 0x7e
      ? (WIDE_KEYS.has(key) ? 4 : 2)
      : group === 0x03
        ? (key === 0x08 ? 4 : 2)
        : group === 0x05 ? 2 : 0;
    if (width === 0) break;
    if (offset + 2 + width > payload.length) break;
    const value = width === 4 ? dataView.getUint32(offset + 2, true) : dataView.getUint16(offset + 2, true);
    out.push({ key, group, width, value, offset });
    offset += 2 + width;
    // A polygon entry is followed by `value` bytes of vertices.
    if (group === 0x7e && key === 0x1b && value <= payload.length - offset) offset += value;
  }
  return out;
}

const document = await openInPage(new Uint8Array(bytes), { strict: false });

for (let offset = 0; offset + 12 <= data.length; offset++) {
  const kind = view.getUint16(offset, true);
  if (kind < 1 || kind > 6 || view.getUint32(offset + 4, true) !== 2) continue;
  const length = view.getUint32(offset + 8, true);
  if (length < 16 || length > 1_000_000 || offset + 12 + length > data.length) continue;
  const id = view.getUint16(offset + 2, true);
  if (!wanted.has(id)) {
    offset += 11 + length;
    continue;
  }
  const parsed = document.pageObjects.find((object) => object.id === id);
  console.log(`\n=== id ${id} kind ${kind} offset 0x${offset.toString(16)} length ${length} ===`);
  console.log("parsed:", JSON.stringify(parsed, (key, value) =>
    key === "polygon" && Array.isArray(value) ? `[${value.length} pts]` : value));
  const payload = data.subarray(offset + 12, offset + 12 + length);
  console.log("entries:");
  for (const entry of entries(payload)) {
    const tag = entry.group === 0x7e ? "draw" : entry.group === 0x05 ? "shape" : entry.group === 0x03 ? "story" : "?";
    console.log(
      `    +${entry.offset.toString(16).padStart(3, "0")}  key=0x${entry.key.toString(16).padStart(2, "0")} ` +
        `${tag} ${entry.width}B value=${entry.value} (0x${entry.value.toString(16)})`,
    );
  }
  console.log("payload:");
  console.log(hex(payload));
  offset += 11 + length;
}
