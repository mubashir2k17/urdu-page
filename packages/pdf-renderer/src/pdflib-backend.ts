import type { ShapedRun } from "@inpage/text-shaper";
import type { EmbeddedImage } from "@inpage/document-model";
import {
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  beginText,
  endMarkedContent,
  endText,
  setFontAndSize,
  setTextMatrix,
  showText,
  rgb,
  degrees,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PdfBackend } from "./backend.js";
import { dibToPng } from "./dib-to-png.js";

/**
 * pdf-lib backend. Emits positioned glyph IDs without invoking fontkit layout.
 * Logical Unicode is attached as ActualText for copy/search accessibility.
 */
export class PdfLibBackend implements PdfBackend {
  private doc: PDFDocument;
  private font: PDFFont | null = null;
  private fontId: string | null = null;
  private currentPage: PDFPage | null = null;
  private currentFontKey: PDFName | null = null;
  private readonly images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

  private constructor(doc: PDFDocument) {
    this.doc = doc;
  }

  static async create(): Promise<PdfLibBackend> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    return new PdfLibBackend(doc);
  }

  async setFont(fontBytes: Uint8Array, fontId = "embedded-fallback"): Promise<void> {
    // Subsetting triggers an additional fontkit layout pass that crashes on
    // some complex Arabic fonts. Full embedding is larger but safer; ordinary
    // shaping and measurement are handled by @inpage/text-shaper.
    this.font = await this.doc.embedFont(fontBytes, { subset: false });
    this.fontId = fontId;
  }

  addPage(width: number, height: number): void {
    if (!this.font) throw new Error("Font must be set before adding a page");
    const page = this.doc.addPage([width, height]);
    this.currentPage = page;
    this.currentFontKey = page.node.newFontDictionary(this.font.name, this.font.ref);
  }

  measureShapedRun(run: ShapedRun, size: number): number {
    return run.totalAdvance * (size / run.unitsPerEm);
  }

  drawShapedRun(run: ShapedRun, x: number, y: number, size: number, rotationDegrees = 0): void {
    if (!this.currentPage) throw new Error("No page added");
    if (!this.font) throw new Error("Font not set");
    if (!this.currentFontKey) throw new Error("Font resource not set");
    if (run.fontId !== this.fontId) {
      throw new Error(
        `Shaped run uses font ${run.fontId}, but the PDF backend embedded ${this.fontId}`,
      );
    }

    const scale = size / run.unitsPerEm;
    const radians = (rotationDegrees * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    let penX = x;
    let penY = y;
    const actualText = PDFHexString.fromText(run.logicalText);

    this.currentPage.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        PDFName.of("Span"),
        `<< /ActualText ${actualText.toString()} >>`,
      ]),
      beginText(),
      setFontAndSize(this.currentFontKey, size),
    );

    for (const glyph of run.glyphs) {
      if (!Number.isInteger(glyph.id) || glyph.id < 0 || glyph.id > 0xffff) {
        throw new Error(`Glyph ID ${glyph.id} cannot be encoded as an Identity-H CID`);
      }
      this.currentPage.pushOperators(
        setTextMatrix(
          cosine,
          sine,
          -sine,
          cosine,
          penX + glyph.xOffset * scale,
          penY + glyph.yOffset * scale,
        ),
        showText(PDFHexString.of(glyph.id.toString(16).padStart(4, "0"))),
      );
      penX += glyph.xAdvance * scale;
      penY += glyph.yAdvance * scale;
    }

    this.currentPage.pushOperators(endText(), endMarkedContent());
  }

  async drawImage(
    image: EmbeddedImage,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDegrees = 0,
  ): Promise<void> {
    if (!this.currentPage) throw new Error("No page added");
    let embedded = this.images.get(image.name);
    if (!embedded) {
      const bytes = image.format === "dib" ? dibToPng(image.bytes) : image.bytes;
      embedded = image.format === "jpeg"
        ? await this.doc.embedJpg(bytes)
        : await this.doc.embedPng(bytes);
      this.images.set(image.name, embedded);
    }
    this.currentPage.drawImage(embedded, {
      x,
      y,
      width,
      height,
      rotate: degrees(rotationDegrees),
    });
  }

  drawLine(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.currentPage) throw new Error("No page added");
    this.currentPage.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 0.6,
      color: rgb(0, 0, 0),
    });
  }

  drawRectangle(x: number, y: number, width: number, height: number): void {
    if (!this.currentPage) throw new Error("No page added");
    this.currentPage.drawRectangle({
      x: Math.min(x, x + width),
      y: Math.min(y, y + height),
      width: Math.abs(width),
      height: Math.abs(height),
      borderWidth: 0.5,
      borderColor: rgb(0, 0, 0),
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
