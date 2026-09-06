import { HarfBuzzTextShaper, type ShapeInput, type ShapedRun, type TextShaper } from "./index.js";

export interface LegacyLigatureGlyph {
  text: string;
  fontId: string;
  glyphId: number;
  advance: number;
  unitsPerEm: number;
}

/** Experimental whole-word matches only: no guessed joining or mark placement. */
export class LegacyLigatureTextShaper implements TextShaper {
  private readonly words = new Map<string, LegacyLigatureGlyph>();
  private readonly fallback = new HarfBuzzTextShaper();

  constructor(entries: readonly LegacyLigatureGlyph[]) {
    for (const entry of entries) {
      if (!entry.text || !entry.fontId || !Number.isInteger(entry.glyphId) ||
          entry.glyphId <= 0 || entry.glyphId > 0xffff ||
          !Number.isFinite(entry.advance) || entry.advance < 0 ||
          !Number.isFinite(entry.unitsPerEm) || entry.unitsPerEm <= 0) {
        throw new Error("Invalid legacy ligature glyph");
      }
      if (this.words.has(entry.text)) throw new Error("Ambiguous legacy ligature text");
      this.words.set(entry.text, { ...entry });
    }
  }

  shape(input: ShapeInput): ShapedRun {
    const fallback = this.fallback.shape(input);
    if (input.direction !== "rtl" || input.script !== "arab") return fallback;
    // Whitespace boundaries preserve entire words and combining sequences.
    const tokens = [...input.text.matchAll(/\S+|\s+/gu)];
    if (!tokens.some(([text]) => this.words.has(text))) return fallback;
    const glyphs = tokens.reverse().flatMap((match) => {
      const text = match[0];
      const entry = this.words.get(text);
      // HarfBuzz addText uses Unicode scalar indices, not UTF-16 offsets.
      const cluster = [...input.text.slice(0, match.index)].length;
      if (entry) return [{
        id: entry.glyphId, fontId: entry.fontId, cluster,
        xAdvance: entry.advance * fallback.unitsPerEm / entry.unitsPerEm,
        yAdvance: 0, xOffset: 0, yOffset: 0,
      }];
      return this.fallback.shape({ ...input, text }).glyphs.map((glyph) => ({
        ...glyph, cluster: glyph.cluster + cluster,
      }));
    });
    return {
      ...fallback, glyphs,
      totalAdvance: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0),
      missingGlyphCount: glyphs.filter(({ id }) => id === 0).length,
    };
  }
}
