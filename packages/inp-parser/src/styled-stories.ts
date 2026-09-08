import type { Paragraph, Story, TextStyle } from "@inpage/document-model";
import type { Mode } from "./charmap.js";
import { decodeLegacy } from "./legacy-decode.js";

interface SourceParagraph { offset: number; length: number; story: number; position: number }
interface StyleSpan { start: number; end: number; data: Uint8Array }

/** A v1 text/style pair is accepted only when both bounded tables cover exactly the same bytes. */
export function decodeStyledStories(data: Uint8Array, mode: Mode): {stories: Story[]; paragraphs: Paragraph[]} | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let marker = 0; marker + 28 < data.length; marker++) {
    if (view.getUint32(marker, true) !== 0xffffffff) continue;
    const spans: StyleSpan[] = [];
    let p = marker + 4;
    let covered = 0;
    while (p + 24 <= data.length && spans.length < 100_000) {
      const count = view.getUint32(p, true);
      const length = view.getUint32(p + 4, true);
      if (!count || count > data.length || length < 16 || length > 100_000 || p + 8 + length > data.length ||
        view.getUint16(p + 8, true) !== 1 || view.getUint32(p + 10, true) !== length - 6) break;
      spans.push({start: covered, end: covered + count, data: data.subarray(p + 14, p + 8 + length)});
      covered += count;
      p += 8 + length;
    }
    if (spans.length < 2 || covered > marker) continue;
    // The earliest complete chain matching the style byte count is the text table.
    for (let start = Math.max(0, marker - covered * 6 - 1024); start < marker; start++) {
      const length = view.getUint32(start, true);
      if (!length || length > covered || start + 4 + length > marker || data[start + 3 + length] !== 13) continue;
      const source = readTextTable(data, view, start, marker, covered);
      if (!source) continue;
      const fontNames = readFontNames(data, start);
      const defaults = readDefaults(data, start, fontNames);
      const styles = spans.map(span => readStyle(span.data, defaults, fontNames));
      const stories: Story[] = [];
      const paragraphs: Paragraph[] = [];
      let spanIndex = 0;
      for (const entry of source) {
        while (stories.length <= entry.story) stories.push({index: stories.length, paragraphs: [], startOffset: entry.offset, endOffset: entry.offset});
        const runs: Paragraph["runs"] = [];
        let position = entry.position;
        while (position < entry.position + entry.length) {
          while (spans[spanIndex]!.end <= position) spanIndex++;
          const span = spans[spanIndex]!;
          const end = Math.min(entry.position + entry.length, span.end);
          const bytes = data.subarray(entry.offset + position - entry.position, entry.offset + end - entry.position);
          const decoded = decodeLegacy(bytes, {mode});
          for (const paragraph of decoded.paragraphs) {
            for (const run of paragraph.runs) runs.push({...run, style: styles[spanIndex]!});
          }
          position = end;
        }
        const paragraph: Paragraph = {index: paragraphs.length, runs, startOffset: entry.offset, endOffset: entry.offset + entry.length};
        const story = stories[entry.story]!;
        story.paragraphs.push(paragraph);
        story.endOffset = paragraph.endOffset;
        paragraphs.push(paragraph);
      }
      return {stories, paragraphs};
    }
  }
  return undefined;
}

function readTextTable(data: Uint8Array, view: DataView, start: number, end: number, expected: number): SourceParagraph[] | undefined {
  const paragraphs: SourceParagraph[] = [];
  let p = start;
  let story = 0;
  let position = 0;
  while (p + 4 <= end) {
    const length = view.getUint32(p, true);
    if (length === 0) {
      if (p + 5 > end || data[p + 4]! > 1) return;
      if (data[p + 4] === 0) story++;
      p += 5;
      continue;
    }
    if (length > expected - position || p + 4 + length > end || data[p + 3 + length] !== 13) return;
    paragraphs.push({offset: p + 4, length, story, position});
    position += length;
    p += 4 + length;
  }
  if (p === end && position === expected && paragraphs.length > 1) return paragraphs;
}

function readFontNames(data: Uint8Array, textStart: number): string[] {
  const first = new TextDecoder("latin1").decode(data.subarray(0, textStart)).lastIndexOf("Noori Nastaliq\0");
  if (first < 0 || (textStart - first) % 54 !== 0 || (textStart - first) / 54 > 256) return [];
  const names: string[] = [];
  for (let p = first; p < textStart; p += 54) {
    const field = data.subarray(p, p + 32);
    const end = field.indexOf(0);
    names.push(new TextDecoder("latin1").decode(field.subarray(0, end < 0 ? 32 : end)));
  }
  return names;
}

function readDefaults(data: Uint8Array, end: number, names: string[]): TextStyle {
  // The document defaults contain consecutive character-face selectors followed by sizing properties.
  for (let p = 0; p + 12 < end; p++) {
    if (data[p] === 0 && data[p + 1] === 2 && data[p + 4] === 1 && data[p + 5] === 2 && data[p + 8] === 2 && data[p + 9] === 2) {
      return readStyle(data.subarray(p, Math.min(end, p + 240)), {fontSize: 12}, names);
    }
  }
  return {fontSize: 12};
}

function readStyle(data: Uint8Array, defaults: TextStyle, names: string[]): TextStyle {
  const style = {...defaults};
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Sizes of the fields verified in the v1 default and run property lists.
  const wide = new Set([0, 5, 6, 0x21, 0x48, 0x81, 0x82, 0x83, 0x8a, 0x8b, 0x8d, 0x8e, 0x8f]);
  for (let p = 0; p + 4 <= data.length;) {
    const tag = view.getUint16(p, true);
    if (tag === 0x40) { p += 2; continue; }
    const group = data[p + 1]!;
    const key = data[p]!;
    if (group === 0x7f && key === 0x93 && p+12 <= data.length) {
      if (!Object.hasOwn(style,"tabStops") || style.tabStops === defaults.tabStops) style.tabStops = [];
      style.tabStops!.push({position:view.getInt32(p+2,true)/2000,alignment:view.getUint16(p+6,true)});
      p += 12;
      continue;
    }
    if (group !== 2 && group !== 0x7f) { p += 2; continue; }
    const length = group === 0x7f && wide.has(key) ? 4 : 2;
    if (p + 2 + length > data.length) break;
    const value = length === 4 ? view.getInt32(p + 2, true) : view.getUint16(p + 2, true);
    if (group === 2) {
      if (key === 1 && names[value]) style.latinFontName = names[value];
      if (key === 2 && names[value]) style.arabicFontName = names[value];
    } else {
      if (key === 0 && value > 0 && value <= 4_000_000) style.fontSize = value / 2000;
      if (key === 1 && value > 0 && value <= 10_000) style.horizontalScale = value / 1000;
      if (key === 2) style.bold = value >= 600;
      if (key === 3) style.italic = value === 1;
      if (key === 5 && Math.abs(value) < 1_000_000) style.baselineShift = value / 2000;
      if (key === 6) {
        // 0x409040: high word 0x3fff means a signed em/1000 value;
        // other values are absolute document distances.
        if (value >>> 16 === 0x3fff) {
          style.trackingEm = (value << 16 >> 16) / 1000;
          style.trackingPoints = 0;
        } else {
          style.trackingPoints = value / 2000;
          style.trackingEm = 0;
        }
      }
      if (key === 7) style.colorIndex = value;
      if (key === 12) style.outline = value === 1;
      if (key === 0x80) style.alignment = ({0: "left", 2: "center", 3: "justify", 4: "right"} as const)[value as 0];
      if (key === 0x8a && value > 0 && value < 4_000_000) style.lineHeight = value / 2000;
    }
    p += 2 + length;
  }
  return style;
}
