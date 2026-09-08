import type { ShapedRun } from "@inpage/text-shaper";
import type { EmbeddedImage, PageObject } from "@inpage/document-model";
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
  pushGraphicsState,
  popGraphicsState,
  setFillingRgbColor,
  setStrokingRgbColor,
  setTextRenderingMode,
  TextRenderingMode,
  setLineWidth,
  moveTo,
  lineTo,
  closePath,
  fill,
  stroke,
  fillAndStroke,
  appendBezierCurve,
  clipEvenOdd,
  endPath,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { PdfBackend, TextAppearance } from "./backend.js";
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
  private readonly fonts = new Map<string, PDFFont>();
  private readonly pageFontKeys = new Map<string, PDFName>();
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
    if (this.fonts.has(fontId)) throw new Error(`Duplicate PDF font identity: ${fontId}`);
    this.font = await this.doc.embedFont(fontBytes, { subset: false });
    this.fontId = fontId;
    this.fonts.set(fontId, this.font);
  }

  async registerFont(fontBytes: Uint8Array, fontId: string): Promise<void> {
    if (!fontId || this.fonts.has(fontId)) throw new Error(`Duplicate or empty PDF font identity: ${fontId}`);
    this.fonts.set(fontId, await this.doc.embedFont(fontBytes, { subset: false }));
  }

  addPage(width: number, height: number): void {
    if (!this.font) throw new Error("Font must be set before adding a page");
    const page = this.doc.addPage([width, height]);
    this.currentPage = page;
    this.pageFontKeys.clear();
    this.currentFontKey = page.node.newFontDictionary(this.font.name, this.font.ref);
    this.pageFontKeys.set(this.fontId!, this.currentFontKey);
  }

  measureShapedRun(run: ShapedRun, size: number): number {
    return run.totalAdvance * (size / run.unitsPerEm) * (run.fontSizeScale ?? 1);
  }

  drawShapedRun(run: ShapedRun, x: number, y: number, size: number, rotationDegrees = 0, appearance:TextAppearance = {}): void {
    size *= run.fontSizeScale ?? 1;
    if (!this.currentPage) throw new Error("No page added");
    if (!this.font) throw new Error("Font not set");
    if (!this.currentFontKey) throw new Error("Font resource not set");
    if (!this.fonts.has(run.fontId)) {
      throw new Error(
        `Shaped run uses font ${run.fontId}, but the PDF backend embedded ${this.fontId}`,
      );
    }
    let runFontKey = this.pageFontKeys.get(run.fontId);
    if (!runFontKey) {
      const runFont = this.fonts.get(run.fontId)!;
      runFontKey = this.currentPage.node.newFontDictionary(runFont.name, runFont.ref);
      this.pageFontKeys.set(run.fontId, runFontKey);
    }
    for (const glyph of run.glyphs) {
      if (glyph.fontId && !this.fonts.has(glyph.fontId)) {
        throw new Error(`Shaped glyph uses unregistered font ${glyph.fontId}`);
      }
      if (!Number.isInteger(glyph.id) || glyph.id < 0 || glyph.id > 0xffff) {
        throw new Error(`Glyph ID ${glyph.id} cannot be encoded as an Identity-H CID`);
      }
    }

    const scale = size / run.unitsPerEm;
    const horizontalScale = appearance.horizontalScale ?? 1;
    const shade = appearance.colorIndex === 1 ? 1 : 0;
    const radians = (rotationDegrees * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    let penX = 0;
    let penY = 0;
    const actualText = PDFHexString.fromText(run.logicalText);

    this.currentPage.pushOperators(
      pushGraphicsState(),
      setFillingRgbColor(shade,shade,shade),
      setStrokingRgbColor(shade,shade,shade),
      setLineWidth(0.5),
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        PDFName.of("Span"),
        `<< /ActualText ${actualText.toString()} >>`,
      ]),
      beginText(),
      setTextRenderingMode(appearance.outline ? TextRenderingMode.Outline : TextRenderingMode.Fill),
      setFontAndSize(runFontKey, size),
    );

    let activeFontId = run.fontId;
    for (const glyph of run.glyphs) {
      const glyphFontId = glyph.fontId ?? run.fontId;
      if (glyphFontId !== activeFontId) {
        let key = this.pageFontKeys.get(glyphFontId);
        if (!key) {
          const font = this.fonts.get(glyphFontId)!;
          key = this.currentPage.node.newFontDictionary(font.name, font.ref);
          this.pageFontKeys.set(glyphFontId, key);
        }
        this.currentPage.pushOperators(setFontAndSize(key, size));
        activeFontId = glyphFontId;
      }
      this.currentPage.pushOperators(
        setTextMatrix(
          cosine * horizontalScale,
          sine * horizontalScale,
          -sine,
          cosine,
          x + (penX + glyph.xOffset * scale) * horizontalScale * cosine - (penY + glyph.yOffset * scale) * sine,
          y + (penX + glyph.xOffset * scale) * horizontalScale * sine + (penY + glyph.yOffset * scale) * cosine,
        ),
        showText(PDFHexString.of(glyph.id.toString(16).padStart(4, "0"))),
      );
      penX += glyph.xAdvance * scale;
      penY += glyph.yAdvance * scale;
    }

    this.currentPage.pushOperators(endText(), endMarkedContent(),popGraphicsState());
  }

  async drawImage(
    image: EmbeddedImage,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDegrees = 0,
    appearance:Pick<PageObject,"shape"|"borderWidth"|"borderStyle"> = {},
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
    if (appearance.shape === "ellipse") {
      const rx=width/2,ry=height/2,cx=x+rx,cy=y+ry,k=0.5522847498307936;
      this.currentPage.pushOperators(pushGraphicsState(),moveTo(cx+rx,cy),
        appendBezierCurve(cx+rx,cy+ry*k,cx+rx*k,cy+ry,cx,cy+ry),
        appendBezierCurve(cx-rx*k,cy+ry,cx-rx,cy+ry*k,cx-rx,cy),
        appendBezierCurve(cx-rx,cy-ry*k,cx-rx*k,cy-ry,cx,cy-ry),
        appendBezierCurve(cx+rx*k,cy-ry,cx+rx,cy-ry*k,cx+rx,cy),closePath(),clipEvenOdd(),endPath());
    }
    this.currentPage.drawImage(embedded, {
      x,
      y,
      width,
      height,
      rotate: degrees(rotationDegrees),
    });
    if (appearance.shape === "ellipse") {
      this.currentPage.pushOperators(popGraphicsState());
      if (appearance.borderStyle) this.currentPage.drawEllipse({x:x+width/2,y:y+height/2,xScale:width/2,yScale:height/2,
        borderColor:rgb(0,0,0),borderWidth:appearance.borderWidth ?? 1,
        ...(appearance.borderStyle === 15 ? {borderDashArray:[3,3]} : {})});
    }
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

  drawGraphic(object:PageObject,pageHeight:number): void {
    if (!this.currentPage) throw new Error("No page added");
    const {xPoints:x,yPoints:top,widthPoints:width,heightPoints:height} = object.bounds;
    const shade = object.fillColorIndex === 2 ? 0 : object.fillColorIndex === 3 ? 0.5 : 1;
    const shouldFill = object.fillColorIndex !== undefined && object.fillColorIndex !== 0;
    const borderWidth = object.hasBorder ? object.borderWidth ?? 1 : 0;
    if (object.polygon?.length) {
      const first=object.polygon[0]!;
      this.currentPage.pushOperators(pushGraphicsState(),setFillingRgbColor(shade,shade,shade),
        setStrokingRgbColor(0,0,0),setLineWidth(borderWidth),moveTo(first.x,pageHeight-first.y),
        ...object.polygon.slice(1).map(point=>lineTo(point.x,pageHeight-point.y)),closePath(),
        shouldFill && borderWidth ? fillAndStroke() : shouldFill ? fill() : stroke(),popGraphicsState());
    } else if (shouldFill || borderWidth) {
      this.currentPage.drawRectangle({x,y:pageHeight-top-height,width,height,borderWidth,
        ...(borderWidth ? {borderColor:rgb(0,0,0)} : {}),
        ...(shouldFill ? {color:rgb(shade,shade,shade)} : {})});
      if (object.fillPattern === 3) {
        const inset=borderWidth;
        for (let py=top+inset+2;py<top+height-inset-2;py+=6) {
          for (let px=x+inset+2;px<x+width-inset-2;px+=7) this.currentPage.drawLine({
            start:{x:px,y:pageHeight-py},end:{x:px+2,y:pageHeight-py-2},thickness:0.35,color:rgb(0,0,0)});
        }
      }
    }
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
