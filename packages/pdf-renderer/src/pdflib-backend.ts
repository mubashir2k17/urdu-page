import { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PdfBackend } from "./backend.js";

/**
 * pdf-lib backend. Emits searchable vector text with a fallback font.
 * Text is drawn in logical (RTL) order; ToUnicode is attached for copy/search.
 */
export class PdfLibBackend implements PdfBackend {
  private doc: PDFDocument;
  private font: PDFFont | null = null;
  private textWidthCache = new Map<string, number>();
  private pages: PDFPage[] = [];
  private currentPage: PDFPage | null = null;

  private constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  static async create(): Promise<PdfLibBackend> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    return new PdfLibBackend(doc);
  }

  async setFont(fontBytes: Uint8Array): Promise<void> {
    // Subsetting triggers an additional fontkit layout pass that crashes on
    // some complex Arabic fonts. Full embedding is larger but safer; ordinary
    // text measurement and encoding still apply the font's GSUB/GPOS layout.
    this.font = await this.doc.embedFont(fontBytes, { subset: false });
    this.textWidthCache.clear();
  }

  addPage(width: number, height: number): void {
    const page = this.doc.addPage([width, height]);
    this.pages.push(page);
    this.currentPage = page;
  }

  measureText(text: string, size: number): number {
    if (!this.font) throw new Error("Font not set");
    const key = `${size}\u0000${text}`;
    const cached = this.textWidthCache.get(key);
    if (cached !== undefined) return cached;
    const width = this.font.widthOfTextAtSize(text, size);
    this.textWidthCache.set(key, width);
    return width;
  }

  drawTextRtl(text: string, x: number, y: number, size: number): void {
    if (!this.currentPage) throw new Error("No page added");
    if (!this.font) throw new Error("Font not set");

    // Draw with a fallback standard font for ASCII that lacks the glyphs in the
    // fallback; for simplicity we draw everything with the fallback and accept
    // missing-glyph boxes for characters it does not cover.
    this.currentPage.drawText(text, {
      x,
      y,
      size,
      font: this.font,
    });
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}

export async function createPdfLibBackend(fontBytes: Uint8Array): Promise<PdfLibBackend> {
  const backend = await PdfLibBackend.create();
  await backend.setFont(fontBytes);
  return backend;
}
