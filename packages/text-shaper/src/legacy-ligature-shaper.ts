import { HarfBuzzTextShaper, type ShapeInput, type ShapedRun, type TextShaper } from "./index.js";

export interface LegacyLigatureGlyph {
  text: string;
  fontId: string;
  glyphId: number;
  advance: number;
  unitsPerEm: number;
  kerning?: {right:number;left:number;clearance:number};
  /** Optional second component drawn at the same origin with no extra advance. */
  overlay?: { fontId: string; glyphId: number };
}

/** Experimental whole-word matches, including verified same-origin overlays. */
export class LegacyLigatureTextShaper implements TextShaper {
  private readonly words = new Map<string, LegacyLigatureGlyph>();
  private readonly fallback = new HarfBuzzTextShaper();
  private readonly glyphMetrics = new Map<string, LegacyLigatureGlyph>();

  constructor(entries: readonly LegacyLigatureGlyph[], private readonly joiningSegments = false) {
    for (const entry of entries) {
      if (!entry.text || !entry.fontId || !Number.isInteger(entry.glyphId) ||
          entry.glyphId <= 0 || entry.glyphId > 0xffff ||
          !Number.isFinite(entry.advance) || entry.advance < 0 ||
          !Number.isFinite(entry.unitsPerEm) || entry.unitsPerEm <= 0) {
        throw new Error("Invalid legacy ligature glyph");
      }
      if (this.words.has(entry.text)) throw new Error("Ambiguous legacy ligature text");
      if (entry.overlay && (!entry.overlay.fontId || !Number.isInteger(entry.overlay.glyphId) ||
          entry.overlay.glyphId <= 0 || entry.overlay.glyphId > 0xffff)) {
        throw new Error("Invalid legacy overlay glyph");
      }
      this.words.set(entry.text, { ...entry, ...(entry.overlay ? { overlay: { ...entry.overlay } } : {}) });
      this.glyphMetrics.set(`${entry.fontId}:${entry.glyphId}`,entry);
    }
  }

  shape(input: ShapeInput): ShapedRun {
    const fallback = this.fallback.shape(input);
    if (input.direction !== "rtl" || input.script !== "arab") return fallback;
    // Whitespace boundaries preserve entire words and combining sequences.
    const tokens = [...input.text.matchAll(/\S+|\s+/gu)].flatMap(match => {
      const text = match[0];
      if (!this.joiningSegments || this.words.has(text) || !/^[\u0621-\u06d3]+$/u.test(text)) {
        return [{text, index:match.index}];
      }
      // These letters terminate a joining segment. Preserve every other joining sequence intact.
      const parts = text.match(/[^اآأإدڈذرڑزژوؤءںےۃ]*[اآأإدڈذرڑزژوؤءںےۃ]\p{M}*|[^اآأإدڈذرڑزژوؤءںےۃ]+/gu) ?? [text];
      let index = match.index;
      return parts.map(part => {const token = {text:part,index}; index += part.length; return token;});
    });
    if (!tokens.some(({text}) => this.words.has(text))) return fallback;
    const glyphs = tokens.reverse().flatMap((match) => {
      const text = match.text;
      const entry = this.words.get(text);
      // HarfBuzz addText uses Unicode scalar indices, not UTF-16 offsets.
      const cluster = [...input.text.slice(0, match.index)].length;
      if (entry) {
        const advance = entry.advance * fallback.unitsPerEm / entry.unitsPerEm;
        const primary = { id: entry.glyphId, fontId: entry.fontId, cluster,
          xAdvance: entry.overlay ? 0 : advance, yAdvance: 0, xOffset: 0, yOffset: 0 };
        return entry.overlay ? [primary, { ...primary,
          id: entry.overlay.glyphId, fontId: entry.overlay.fontId, xAdvance: advance }] : [primary];
      }
      if (this.joiningSegments && /^ +$/.test(text)) {
        // 0x40a356 uses 150/1000 em for a normal Noori word space.
        const space = this.fallback.shape({...input,text:" "}).glyphs[0]!;
        return [{id: space.id, cluster, xAdvance: text.length * 150 * fallback.unitsPerEm / 1000,
          yAdvance: 0, xOffset: 0, yOffset: 0}];
      }
      return this.fallback.shape({ ...input, text }).glyphs.map((glyph) => ({
        ...glyph, cluster: glyph.cluster + cluster,
      }));
    });
    if (this.joiningSegments) {
      let previousLeft: number | undefined;
      for (let end = glyphs.length; end > 0;) {
        let start = end - 1;
        while (start > 0 && glyphs[start - 1]!.cluster === glyphs[end - 1]!.cluster) start--;
        const glyph = glyphs[start]!;
        const entry = this.glyphMetrics.get(`${glyph.fontId}:${glyph.id}`);
        if (entry?.kerning) {
          const scale = fallback.unitsPerEm / entry.unitsPerEm;
          const carrier = glyphs[end - 1]!;
          if (previousLeft !== undefined) carrier.xAdvance = Math.min(carrier.xAdvance, Math.max(0,entry.kerning.right * scale + previousLeft));
          previousLeft = (entry.kerning.clearance-entry.kerning.left)*scale;
        } else {
          const scalarText = [...input.text];
          // A single space preserves the previous boundary; repeated spaces
          // reset it (0x40a690–0x40a6ce).
          if (scalarText[glyph.cluster] !== " " || scalarText[glyph.cluster + 1] === " ") previousLeft = undefined;
        }
        end = start;
      }
    }
    return {
      ...fallback, glyphs,
      totalAdvance: glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0),
      missingGlyphCount: glyphs.filter(({ id }) => id === 0).length,
    };
  }
}
