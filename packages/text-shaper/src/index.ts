import {
  Blob,
  Buffer,
  Direction,
  Face,
  Font,
  shape as shapeWithHarfBuzz,
} from "harfbuzzjs";

export type TextDirection = "ltr" | "rtl";

export interface ShapeFont {
  /** Stable identity used to associate the result with embedded font bytes. */
  id: string;
  bytes: Uint8Array;
  /** Zero-based face index for font collections. Defaults to zero. */
  faceIndex?: number;
}

export interface ShapeInput {
  /** Logical Unicode text for one already-segmented run. */
  text: string;
  font: ShapeFont;
  direction: TextDirection;
  language: string;
  script: string;
}

export interface ShapedGlyph {
  id: number;
  /** Optional font override; metrics remain in the enclosing run's units. */
  fontId?: string;
  /** Source-text cluster index supplied by HarfBuzz. */
  cluster: number;
  xAdvance: number;
  yAdvance: number;
  /** A native kashida can follow this cluster; metrics use the run scale. */
  kashida?: {id:number;fontId:string;advance:number;weight:number};
  xOffset: number;
  yOffset: number;
}

export { decodeInPageFontData, readInPageBankMetrics, readInPageIsolatedGlyph } from "./inpage-font-data.js";
export type { InPageLigature, InPageBankMetrics } from "./inpage-font-data.js";
export { LegacyLigatureTextShaper } from "./legacy-ligature-shaper.js";
export type { LegacyLigatureGlyph } from "./legacy-ligature-shaper.js";
export { LegacyArabicTextShaper } from "./legacy-arabic-shaper.js";
export type { ArabicGlyphSubstitution, ArabicLetterForms } from "./legacy-arabic-shaper.js";

export interface ShapedRun {
  logicalText: string;
  fontId: string;
  direction: TextDirection;
  language: string;
  script: string;
  /** Coordinate scale used by every glyph metric in this run. */
  unitsPerEm: number;
  /** Optional cell-height to em-height conversion for legacy Windows fonts. */
  fontSizeScale?: number;
  glyphs: ShapedGlyph[];
  totalAdvance: number;
  missingGlyphCount: number;
}

/** The renderer-facing shaping seam. Implementations must not retain input text. */
export interface TextShaper {
  shape(input: ShapeInput): ShapedRun;
}

interface CachedFont {
  blob: Blob;
  face: Face;
  font: Font;
}

/** Portable HarfBuzz/WASM adapter. */
export class HarfBuzzTextShaper implements TextShaper {
  private readonly fonts = new WeakMap<Uint8Array, Map<number, CachedFont>>();
  private readonly buffer = new Buffer();

  shape(input: ShapeInput): ShapedRun {
    assertShapeInput(input);
    const cached = this.getFont(input.font);
    this.buffer.clearContents();
    this.buffer.addText(input.text);
    this.buffer.setDirection(input.direction === "rtl" ? Direction.RTL : Direction.LTR);
    this.buffer.setLanguage(input.language);
    this.buffer.setScript(input.script);

    shapeWithHarfBuzz(cached.font, this.buffer);

    const glyphs = this.buffer.getGlyphInfosAndPositions().map(
      ({ codepoint, cluster, xAdvance, yAdvance, xOffset, yOffset }): ShapedGlyph => ({
        id: codepoint,
        cluster,
        xAdvance: xAdvance ?? 0,
        yAdvance: yAdvance ?? 0,
        xOffset: xOffset ?? 0,
        yOffset: yOffset ?? 0,
      }),
    );

    return {
      logicalText: input.text,
      fontId: input.font.id,
      direction: input.direction,
      language: input.language,
      script: input.script,
      unitsPerEm: cached.face.upem,
      glyphs,
      totalAdvance: glyphs.reduce((total, glyph) => total + glyph.xAdvance, 0),
      missingGlyphCount: glyphs.filter(({ id }) => id === 0).length,
    };
  }

  private getFont(source: ShapeFont): CachedFont {
    const faceIndex = source.faceIndex ?? 0;
    let faces = this.fonts.get(source.bytes);
    if (!faces) {
      faces = new Map();
      this.fonts.set(source.bytes, faces);
    }

    const existing = faces.get(faceIndex);
    if (existing) return existing;

    const blob = new Blob(source.bytes);
    const face = new Face(blob, faceIndex);
    const cached = { blob, face, font: new Font(face) };
    faces.set(faceIndex, cached);
    return cached;
  }
}

function assertShapeInput(input: ShapeInput): void {
  if (input.direction !== "ltr" && input.direction !== "rtl") {
    throw new Error("direction must be ltr or rtl");
  }
  if (input.font.id.length === 0) throw new Error("font id must not be empty");
  if (input.font.bytes.length === 0) throw new Error("font bytes must not be empty");
  if (input.language.length === 0) throw new Error("language must not be empty");
  if (input.script.length === 0) throw new Error("script must not be empty");
}
