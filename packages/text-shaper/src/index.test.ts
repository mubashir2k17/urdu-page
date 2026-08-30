import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HarfBuzzTextShaper } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fontBytes = new Uint8Array(
  readFileSync(join(here, "../../../fonts/NotoSansArabic-Regular.ttf")),
);

describe("HarfBuzzTextShaper", () => {
  it("returns positioned RTL glyphs while preserving logical text", () => {
    const shaper = new HarfBuzzTextShaper();
    const shaped = shaper.shape({
      text: "بحریہ میں پاکستان",
      font: { id: "NotoSansArabic-Regular", bytes: fontBytes },
      direction: "rtl",
      language: "ur",
      script: "arab",
    });

    expect(shaped.logicalText).toBe("بحریہ میں پاکستان");
    expect(shaped.fontId).toBe("NotoSansArabic-Regular");
    expect(shaped.direction).toBe("rtl");
    expect(shaped.unitsPerEm).toBe(1000);
    expect(shaped.glyphs).toHaveLength(17);
    expect(shaped.glyphs[0]).toMatchObject({ id: 826, cluster: 16, xAdvance: 684 });
    expect(shaped.glyphs.at(-1)).toMatchObject({ id: 101, cluster: 0, xAdvance: 249 });
    expect(shaped.totalAdvance).toBe(
      shaped.glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0),
    );
    expect(shaped.missingGlyphCount).toBe(0);
  });

  it("reports missing glyphs without discarding the run", () => {
    const shaper = new HarfBuzzTextShaper();
    const shaped = shaper.shape({
      text: "InPage 123",
      font: { id: "NotoSansArabic-Regular", bytes: fontBytes },
      direction: "ltr",
      language: "en",
      script: "latn",
    });

    expect(shaped.glyphs).toHaveLength(10);
    expect(shaped.missingGlyphCount).toBe(6);
    expect(shaped.glyphs.slice(0, 6).every(({ id }) => id === 0)).toBe(true);
  });

  it("rejects unsegmented direction before shaping", () => {
    const shaper = new HarfBuzzTextShaper();

    expect(() =>
      shaper.shape({
        text: "متن",
        font: { id: "NotoSansArabic-Regular", bytes: fontBytes },
        direction: "auto" as never,
        language: "ur",
        script: "arab",
      }),
    ).toThrow("direction must be ltr or rtl");
  });
});
