import type { Diagnostic } from "@inpage/diagnostics";
import type { Paragraph } from "@inpage/document-model";

export interface V3DecodeResult {
  paragraphs: Paragraph[];
  diagnostics: Diagnostic[];
}

const BOUNDARY_MARKER = [0xff, 0xff, 0xff, 0xff, 0x0d, 0x00];

interface TextSpan {
  styleId: number;
  byteLength: number;
}

/**
 * Decode an InPage v3 stream (UTF-16LE with a struct array + text spans).
 * Spec-driven (iamahsanmehmood/inpage-format specs/04-encoding-v3.md); not
 * fixture-verified until v3 fixtures are available.
 */
export function decodeV3(data: Uint8Array): V3DecodeResult {
  const diagnostics: Diagnostic[] = [];
  const boundary = findBoundary(data);

  if (boundary < 0) {
    diagnostics.push({
      severity: "error",
      category: "parsing",
      code: "INP_V3_NO_BOUNDARY",
      message: "InPage v3 boundary marker not found",
    });
    return { paragraphs: [], diagnostics };
  }

  const textStart = boundary + BOUNDARY_MARKER.length;
  const structs = readStructArray(data, boundary, diagnostics);
  const paragraphs = decodeSpans(data, textStart, structs, diagnostics);

  return { paragraphs, diagnostics };
}

function findBoundary(data: Uint8Array): number {
  // Search from 0x1000 first (fast path), then from 0.
  const from1000 = indexOf(data, BOUNDARY_MARKER, 0x1000);
  if (from1000 >= 0) return from1000;
  return indexOf(data, BOUNDARY_MARKER, 0);
}

function indexOf(data: Uint8Array, pattern: number[], from: number): number {
  outer: for (let i = Math.max(0, from); i <= data.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function readStructArray(
  data: Uint8Array,
  boundary: number,
  diagnostics: Diagnostic[],
): TextSpan[] {
  const structs: TextSpan[] = [];
  let pos = boundary - 8;
  while (pos >= 0) {
    const styleId = readU32(data, pos);
    const byteLength = readU32(data, pos + 4);
    if (styleId === 0 && byteLength === 0) break;
    if (styleId > 1000 || byteLength > 100000) break;
    structs.push({ styleId, byteLength });
    pos -= 8;
  }
  structs.reverse();
  if (structs.length === 0) {
    diagnostics.push({
      severity: "warning",
      category: "parsing",
      code: "INP_V3_NO_STRUCTS",
      message: "InPage v3 style struct array is empty",
    });
  }
  return structs;
}

function decodeSpans(
  data: Uint8Array,
  textStart: number,
  structs: TextSpan[],
  diagnostics: Diagnostic[],
): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current = "";
  let pos = textStart;
  let paragraphIndex = 0;
  let paragraphStart = textStart;

  function flush(): void {
    if (current.length > 0) {
      paragraphs.push({
        index: paragraphIndex++,
        runs: [{ kind: "text", text: current }],
        startOffset: paragraphStart,
        endOffset: pos,
      });
    }
    current = "";
  }

  for (const span of structs) {
    const chunkEnd = Math.min(pos + span.byteLength, data.length);
    const chunk = data.subarray(pos, chunkEnd);
    let i = 0;
    while (i + 1 < chunk.length) {
      const cp = readU16(chunk, i);
      const isCtrl =
        (cp >= 0x0001 && cp <= 0x001f && cp !== 0x000d && cp !== 0x0009 && cp !== 0x000a) ||
        cp === 0x007e;

      if (isCtrl && i + 3 < chunk.length) {
        const recordLen = readU16(chunk, i + 2);
        i += 4 + recordLen;
        continue;
      }

      if (cp === 0x000d) {
        flush();
        current = "";
        paragraphStart = pos + i + 2;
      } else if (cp >= 0x0020 || cp === 0x0009 || cp === 0x000a) {
        current += String.fromCharCode(cp);
      }
      i += 2;
    }
    pos = chunkEnd;
    if (pos >= data.length) break;
  }

  flush();
  return paragraphs;
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}
