import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeInPageFontData, readInPageBankMetrics } from "@inpage/text-shaper";
import { loadInPageTypography } from "../tools/inpage-fonts.js";

const directory = resolve("fonts/inpage-local");
describe.skipIf(!existsSync(resolve(directory, "INPAGEU.DAT")))("local InPage installation", () => {
  it("recovers the observed tree and a known bank mapping", () => {
    const entries = decodeInPageFontData(readFileSync(resolve(directory, "INPAGEU.DAT")));
    expect(entries).toHaveLength(17989);
    expect(entries.find(({ legacyCodes }) => legacyCodes.join() === "129,164,156")).toEqual({
      legacyCodes: [0x81, 0xa4, 0x9c], components: [{ bank: 84, slot: 0x65 }],
    });
  });

  it("shapes a recovered word using a copied bank with no missing glyphs", () => {
    const typography = loadInPageTypography(directory);
    const run = typography.shaper.shape({ text: "میں", direction: "rtl", language: "ur", script: "arab",
      font: { id: "fallback", bytes: readFileSync(resolve("fonts/NotoNastaliqUrdu-Regular.ttf")) } });
    expect(run.glyphs).toHaveLength(1);
    expect(run.glyphs[0]).toMatchObject({ fontId: "inpage-noorin-16", id: 97 });
    expect(run.missingGlyphCount).toBe(0);
    // The DAT references bank 84 / 0x65 for this word, but the supplied font
    // has no glyph at that slot. Joining-segment fallback must avoid that slot.
    const missing = typography.shaper.shape({ text: "ایک", direction: "rtl", language: "ur", script: "arab",
      font: { id: "fallback", bytes: readFileSync(resolve("fonts/NotoNastaliqUrdu-Regular.ttf")) } });
    expect(missing.glyphs.every(({fontId})=>fontId !== "inpage-noorin-84")).toBe(true);
    expect(missing.logicalText).toBe("ایک");
    expect(missing.missingGlyphCount).toBe(0);
  });

  it("assembles Beh-Alef from separate dot and body banks with source advance", () => {
    const typography = loadInPageTypography(directory);
    const data = readFileSync(resolve(directory, "INPAGEU.DAT"));
    expect(readInPageBankMetrics(data, 81, 33)).toMatchObject({ unitsPerEm: 1000, width: 249, right:272, left:-182 });
    expect(readInPageBankMetrics(data, 86, 42)).toMatchObject({ unitsPerEm: 0, width: 0 });
    const run = typography.shaper.shape({ text: "با", direction: "rtl", language: "ur", script: "arab",
      font: { id: "fallback", bytes: readFileSync(resolve("fonts/NotoNastaliqUrdu-Regular.ttf")) } });
    expect(run.glyphs).toMatchObject([
      { fontId: "inpage-noorin-81", id: 4, xAdvance: 0, xOffset: 0 },
      { fontId: "inpage-noorin-86", id: 9, xAdvance: 314, xOffset: 0 },
    ]);
    expect(run.totalAdvance).toBe(314);
    expect(run.missingGlyphCount).toBe(0);
  });
});
