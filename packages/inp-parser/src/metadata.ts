import type { Diagnostic } from "@inpage/diagnostics";
import type {
  ColorRecord,
  DocumentMetadata,
  FontRecord,
} from "@inpage/document-model";

const FONT_NAME_PATTERNS = [
  "InPage",
  "Nastaliq",
  "Naskh",
  "Arial",
  "Faiz",
  "Noori",
  "Jameel",
  "Times",
  "Noto",
  "Tahoma",
  "Verdana",
  "Courier",
  "Symbol",
  "Gulzar",
  "Alvi",
  "Mehr",
  "Nafees",
  "Firoz",
  "Sadaf",
  "Zohar",
  "Diwani",
  "Ghalib",
  "Dubai",
  "Webdings",
  "Wingdings",
  "Simplified",
  "Trad",
  "asaar",
  "rad Arabic",
  "Persian",
  "Lahori",
  "ouqa",
  "halib",
  "iwani",
];

const COLOR_NAMES = [
  "None",
  "White",
  "Black",
  "Gray",
  "Grey",
  "Red",
  "Yellow",
  "Green",
  "Cyan",
  "Blue",
  "Magenta",
];

/**
 * Extract UTF-16LE or ASCII font-name strings from a stream (best-effort).
 * Returns de-duplicated font records with low/medium confidence.
 */
export function extractFonts(data: Uint8Array): FontRecord[] {
  const names = new Set<string>();
  for (const pattern of FONT_NAME_PATTERNS) {
    // Try ASCII (single-byte) first, then UTF-16LE.
    const ascii = toAscii(pattern);
    const utf16 = toUtf16Le(pattern);

    let idx = indexOf(data, ascii, 0);
    while (idx >= 0) {
      const name = readAsciiNameAround(data, idx, ascii.length);
      if (name.length > 1) names.add(name);
      idx = indexOf(data, ascii, idx + 1);
    }

    idx = indexOf(data, utf16, 0);
    while (idx >= 0) {
      const name = readFontNameAround(data, idx, utf16.length);
      if (name.length > 1) names.add(name);
      idx = indexOf(data, utf16, idx + 2);
    }
  }
  return [...names].map((name, index) => ({
    name,
    index,
    confidence: "medium" as const,
  }));
}

function readAsciiNameAround(data: Uint8Array, idx: number, matchLen: number): string {
  // ASCII font names are null-terminated. Walk back to previous null/non-printable,
  // then forward to the null terminator.
  let start = idx;
  while (start - 1 >= 0) {
    const b = data[start - 1]!;
    if (b === 0x00) break;
    start -= 1;
  }
  let end = idx + matchLen;
  while (end < data.length) {
    const b = data[end]!;
    if (b === 0x00) break;
    end += 1;
  }
  let out = "";
  for (let i = start; i < end; i++) {
    const b = data[i]!;
    if (b === 0x00) break;
    // Only keep printable ASCII.
    if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
  }
  return out.trim();
}

function readFontNameAround(data: Uint8Array, idx: number, matchLen: number): string {
  // Font names are UTF-16LE null-terminated. Walk back to a plausible start
  // (previous null), then forward to the null terminator.
  let start = idx;
  while (start - 2 >= 0) {
    const b0 = data[start - 2]!;
    const b1 = data[start - 1]!;
    if (b0 === 0 && b1 === 0) break;
    start -= 2;
  }
  let end = idx + matchLen;
  while (end + 1 < data.length) {
    const b0 = data[end]!;
    const b1 = data[end + 1]!;
    if (b0 === 0 && b1 === 0) break;
    end += 2;
  }
  return decodeUtf16Le(data.subarray(start, end));
}

/** Extract color palette records (name + RGB) from a stream. */
export function extractColors(data: Uint8Array): ColorRecord[] {
  const colors: ColorRecord[] = [];
  for (const name of COLOR_NAMES) {
    // Try ASCII first, then UTF-16LE.
    const ascii = toAscii(name);
    const utf16 = toUtf16Le(name);

    let idx = indexOf(data, ascii, 0);
    while (idx >= 0) {
      const rec = readColorAfter(data, idx + ascii.length);
      if (rec) colors.push({ name, ...rec, confidence: "medium" });
      idx = indexOf(data, ascii, idx + 1);
    }

    idx = indexOf(data, utf16, 0);
    while (idx >= 0) {
      const rec = readColorAfter(data, idx + utf16.length);
      if (rec) colors.push({ name, ...rec, confidence: "medium" });
      idx = indexOf(data, utf16, idx + 2);
    }
  }
  // De-duplicate by name, keeping the first.
  const seen = new Set<string>();
  return colors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

function readColorAfter(
  data: Uint8Array,
  offset: number,
): { r: number; g: number; b: number } | null {
  let p = offset;
  while (p < data.length && data[p] === 0) p++;
  const r = data[p] ?? 0;
  const g = data[p + 1] ?? 0;
  const b = data[p + 2] ?? 0;
  if (r <= 255 && g <= 255 && b <= 255) {
    return { r, g, b };
  }
  return null;
}

/** Extract document metadata from a DocumentInfo stream (UTF-16LE key/value). */
export function extractMetadata(documentInfo: Uint8Array): DocumentMetadata {
  const meta: DocumentMetadata = { confidence: "low" };
  // Best-effort: look for common title/author markers as UTF-16LE.
  const titleKey = toUtf16Le("Title");
  const authorKey = toUtf16Le("Author");
  const titleIdx = indexOf(documentInfo, titleKey, 0);
  if (titleIdx >= 0) {
    const value = readValueAfter(documentInfo, titleIdx + titleKey.length);
    if (value.length > 0) meta.title = value;
  }
  const authorIdx = indexOf(documentInfo, authorKey, 0);
  if (authorIdx >= 0) {
    const value = readValueAfter(documentInfo, authorIdx + authorKey.length);
    if (value.length > 0) meta.author = value;
  }
  if (meta.title || meta.author) meta.confidence = "medium";
  return meta;
}

function readValueAfter(data: Uint8Array, offset: number): string {
  let p = offset;
  while (p < data.length && data[p] === 0) p++;
  let end = p;
  while (end + 1 < data.length) {
    if (data[end] === 0 && data[end + 1] === 0) break;
    end += 2;
  }
  return decodeUtf16Le(data.subarray(p, end)).trim();
}

function toAscii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    out[i] = s.charCodeAt(i) & 0xff;
  }
  return out;
}

function toUtf16Le(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) {
    const cp = s.charCodeAt(i);
    out[i * 2] = cp & 0xff;
    out[i * 2 + 1] = (cp >> 8) & 0xff;
  }
  return out;
}

function decodeUtf16Le(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const cp = bytes[i]! | (bytes[i + 1]! << 8);
    if (cp === 0) break;
    out += String.fromCharCode(cp);
  }
  return out;
}

function indexOf(data: Uint8Array, pattern: Uint8Array, from: number): number {
  outer: for (let i = from; i <= data.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (data[i + j] !== pattern[j]) continue outer;
    }
    return i;
  }
  return -1;
}
