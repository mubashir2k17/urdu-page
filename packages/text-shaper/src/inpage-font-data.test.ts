import { describe, expect, it } from "vitest";
import { decodeInPageFontData, INPAGE_FONT_DATA_SIZE } from "./inpage-font-data.js";

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
});
