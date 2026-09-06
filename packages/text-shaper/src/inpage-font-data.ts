/** Observed INPAGEU.DAT layout; this profile is intentionally version-specific. */
export const INPAGE_FONT_DATA_SIZE = 352422;
const TRIE_START = 0x2334;
const TRIE_END = 0x2e4a4;
const ROOTS_START = 0x51ca4;

export interface InPageLigature {
  legacyCodes: number[];
  /** Each pair is an InPage font bank and its Windows symbol character slot. */
  components: { bank: number; slot: number }[];
}

/** Decode the observed 1999 data file without executing the Windows program. */
export function decodeInPageFontData(source: Uint8Array): InPageLigature[] {
  if (source.length !== INPAGE_FONT_DATA_SIZE ||
      source[0] !== 0xe0 || source[1] !== 0x45) {
    throw new Error("Unsupported INPAGEU.DAT profile");
  }
  const bytes = new Uint8Array(source);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The loader decodes the first 1500 words; the rest of the trie is plain.
  for (let offset = TRIE_START; offset < TRIE_START + 3000; offset += 2) {
    const word = view.getUint16(offset, true) ^ 0xa567;
    view.setUint16(offset, (word >>> 8) | ((word & 255) << 8), true);
  }
  const entries: InPageLigature[] = [];
  const visited = new Set<number>();
  function walk(start: number, count: number, prefix: number[]): void {
    if (prefix.length > 32) throw new Error("InPage ligature trie exceeds depth limit");
    for (let index = start; index < start + count; index++) {
      const offset = TRIE_START + index * 8;
      if (offset + 8 > TRIE_END || visited.has(index)) {
        throw new Error("Invalid InPage ligature trie reference");
      }
      visited.add(index);
      const code = bytes[offset + 3]!;
      if (code < 0x81) throw new Error("Invalid InPage ligature character");
      const legacyCodes = [...prefix, code];
      const components: InPageLigature["components"] = [];
      for (const delta of [4, 6]) {
        const encodedBank = bytes[offset + delta]!;
        const slot = bytes[offset + delta + 1]!;
        if (encodedBank === 0 && slot === 0) continue;
        if (encodedBank < 0x81 || encodedBank > 0xe6 || slot < 0x20) {
          throw new Error("Invalid InPage ligature font/slot pair");
        }
        components.push({ bank: encodedBank - 0x80, slot });
      }
      if (components.length) entries.push({ legacyCodes, components });
      walk(view.getUint16(offset, true), bytes[offset + 2]!, legacyCodes);
    }
  }
  for (let code = 0x81; code <= 0xa7; code++) {
    const offset = ROOTS_START + code * 20;
    walk(view.getUint16(offset, true), bytes[offset + 2]!, [code]);
  }
  return entries;
}
