import { describe, expect, it } from "vitest";
import { decodeInPageFontData, readInPageBankMetrics, INPAGE_FONT_DATA_SIZE } from "./inpage-font-data.js";

// Synthetic profile: Beh -> Yeh, with one bank/slot pair. No vendor data.
function fixture(child = 0, count = 0): Uint8Array {
  const bytes = new Uint8Array(INPAGE_FONT_DATA_SIZE);
  const view = new DataView(bytes.buffer);
  bytes.set([0xe0, 0x45]);
  bytes[0x51ca4 + 0x82 * 20 + 2] = 1;
  view.setUint16(0x2334, child, true);
  bytes.set([count, 0xa4, 0x85, 0x42, 0, 0], 0x2336);
  for (let offset = 0x2334; offset < 0x2334 + 3000; offset += 2) {
    const word = view.getUint16(offset, true);
    view.setUint16(offset, ((word >>> 8) | ((word & 255) << 8)) ^ 0xa567, true);
  }
  return bytes;
}

describe("InPage font data", () => {
  it("decodes bank/slot pairs without modifying the input or its byte offset", () => {
    const bytes = fixture();
    const padded = new Uint8Array(bytes.length + 10);
    padded.set(bytes, 5);
    expect(decodeInPageFontData(padded.subarray(5, -5))).toEqual([
      { legacyCodes: [0x82, 0xa4], components: [{ bank: 5, slot: 0x42 }] },
    ]);
    expect(padded.subarray(5, -5)).toEqual(bytes);
    const buffer = Buffer.from(bytes);
    decodeInPageFontData(buffer);
    expect(new Uint8Array(buffer)).toEqual(bytes);
  });

  it("rejects truncated and unknown profiles", () => {
    expect(() => decodeInPageFontData(fixture().subarray(1))).toThrow("profile");
    const bytes = fixture();
    bytes[0] = 0;
    expect(() => decodeInPageFontData(bytes)).toThrow("profile");
  });

  it("rejects cycles and references outside the trie", () => {
    expect(() => decodeInPageFontData(fixture(0, 1))).toThrow("reference");
    expect(() => decodeInPageFontData(fixture(0xffff, 1))).toThrow("reference");
  });

  it("reads unsigned bank widths and preserves zero-width overlay metrics", () => {
    const bytes = fixture();
    const view = new DataView(bytes.buffer);
    view.setUint16(0x2e4a4 + 81 * 512, 1000, true);
    view.setUint16(0x2e4a4 + 81 * 512 + 33 * 2, 249, true);
    view.setInt16(0x398a4 + (81 * 256 + 33) * 4, 353, true);
    view.setInt16(0x398a4 + (81 * 256 + 33) * 4 + 2, -194, true);
    expect(readInPageBankMetrics(bytes, 81, 33)).toEqual({ unitsPerEm: 1000, width: 249, right: 353, left: -194 });
    expect(readInPageBankMetrics(bytes, 86, 42)).toEqual({ unitsPerEm: 0, width: 0, right: 0, left: 0 });
    view.setUint16(0x2e4a4 + 86 * 512 + 42 * 2, 1, true);
    expect(() => readInPageBankMetrics(bytes, 86, 42)).toThrow("denominator");
    for (const [bank, slot] of [[0, 33], [90, 33], [81.5, 33], [81, 256], [81, -1]]) {
      expect(() => readInPageBankMetrics(bytes, bank!, slot!)).toThrow("reference");
    }
  });
});
