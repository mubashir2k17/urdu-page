import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeInPageFontData } from "@inpage/text-shaper";
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
    // has no glyph at that slot. Preserve the Unicode fallback in that case.
    const missing = typography.shaper.shape({ text: "ایک", direction: "rtl", language: "ur", script: "arab",
      font: { id: "fallback", bytes: readFileSync(resolve("fonts/NotoNastaliqUrdu-Regular.ttf")) } });
    expect(missing.glyphs.every(({ fontId }) => fontId === undefined)).toBe(true);
  });
});
