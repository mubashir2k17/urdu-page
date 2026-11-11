import type { ShapedRun } from "@inpage/text-shaper";
import type { EmbeddedImage, PageObject } from "@inpage/document-model";
import {
  PDFDocument,
  PDFDict,
  PDFFont,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  PDFPage,
  StandardFonts,
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
  setLineCap,
  setLineJoin,
  LineCapStyle,
  LineJoinStyle,
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
import fontkit, {type Font} from "@pdf-lib/fontkit";
import {glyphOutline} from "./glyph-outline.js";
import type { PdfBackend, TextAppearance } from "./backend.js";
import { dibToPng } from "./dib-to-png.js";



/** Native 600 dpi printer grid (72/600 pt per step). */
const DEVICE_STEP_POINTS = 72 / 600;
function snapToDevice(value: number): number {
  return Math.floor(value / DEVICE_STEP_POINTS + 1e-9) * DEVICE_STEP_POINTS;
}

/** Options for {@link computeGraphicBoundary}. */
export interface GraphicBoundaryOptions {
  /** Sample points per polygon edge (default 1: the decoded vertices). */
  edgeSamples?: number;
  /** Sample points per ellipse quadrant and per rounded corner (default 24). */
  curveSamples?: number;
  /** Corner rounding radius in points (default 0 keeps sharp vertices). */
  cornerRadius?: number;
}

/**
 * Compute the closed boundary polygon of a graphic object from its decoded
 * bounds, polygon and style — never from its object id.
 *
 * Evidence (docs/reverse-engineering/drawing-records.md, and the clips
 * recovered from the SAMPLE2 reference PDF): the native text-wrap boundary of
 * a polygon graphic is the decoded polygon itself. Every boundary edge is
 * straight — the recovered clips' "curves" deviate <= 0.01 pt from their
 * chords; the native path machinery (FUN_0041b410/FUN_0041b860/FUN_004d4ef0)
 * merely flattens its bezier-encoded straight edges onto a 0.12 pt device grid
 * and bevels some vertices by up to ~2 pt. Ellipse frames sample an ellipse
 * over the bounds; anything else falls back to the bounds rectangle.
 *
 * The loop is explicitly closed: the first point is repeated at the end.
 */
export function computeGraphicBoundary(
  object: PageObject,
  options: GraphicBoundaryOptions = {},
): Array<[number, number]> {
  const edgeSamples = Math.max(1, Math.trunc(options.edgeSamples ?? 1));
  const curveSamples = Math.max(2, Math.trunc(options.curveSamples ?? 24));
  const cornerRadius = options.cornerRadius ?? 0;

  const vertices = object.polygon;
  if (vertices && vertices.length >= 3) {
    return samplePolygonBoundary(vertices, edgeSamples, curveSamples, cornerRadius);
  }
  const { xPoints: x, yPoints: y, widthPoints: width, heightPoints: height } = object.bounds;
  if (object.shape === "ellipse") {
    return sampleEllipseBoundary(
      x + width / 2,
      y + height / 2,
      Math.max(0, width / 2),
      Math.max(0, height / 2),
      curveSamples,
    );
  }
  return [[x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y]];
}

/** Polygon boundary: chords between decoded vertices, optional corner rounding. */
function samplePolygonBoundary(
  vertices: ReadonlyArray<{ x: number; y: number }>,
  edgeSamples: number,
  curveSamples: number,
  cornerRadius: number,
): Array<[number, number]> {
  const count = vertices.length;
  let frame: Array<[number, number]>;
  if (cornerRadius > 0) {
    // Trim each vertex by the radius and bridge the gap with a quadratic arc
    // through the vertex; concave corners are cut the same way.
    frame = [];
    for (let i = 0; i < count; i++) {
      const prev = vertices[(i - 1 + count) % count]!;
      const vertex = vertices[i]!;
      const next = vertices[(i + 1) % count]!;
      const dPrev = Math.hypot(vertex.x - prev.x, vertex.y - prev.y);
      const dNext = Math.hypot(next.x - vertex.x, next.y - vertex.y);
      const trim = Math.min(cornerRadius, dPrev / 2, dNext / 2);
      const towardPrev = dPrev > 0 ? trim / dPrev : 0;
      const towardNext = dNext > 0 ? trim / dNext : 0;
      const p1: [number, number] = [
        vertex.x + (prev.x - vertex.x) * towardPrev,
        vertex.y + (prev.y - vertex.y) * towardPrev,
      ];
      const p2: [number, number] = [
        vertex.x + (next.x - vertex.x) * towardNext,
        vertex.y + (next.y - vertex.y) * towardNext,
      ];
      frame.push(p1);
      for (let s = 1; s <= curveSamples; s++) {
        const t = s / curveSamples;
        const u = 1 - t;
        frame.push([
          u * u * p1[0]! + 2 * u * t * vertex.x + t * t * p2[0]!,
          u * u * p1[1]! + 2 * u * t * vertex.y + t * t * p2[1]!,
        ]);
      }
    }
  } else {
    frame = vertices.map((vertex) => [vertex.x, vertex.y] as [number, number]);
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < frame.length; i++) {
    const a = frame[i]!;
    const b = frame[(i + 1) % frame.length]!;
    for (let s = 0; s < edgeSamples; s++) {
      const t = s / edgeSamples;
      out.push([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]);
    }
  }
  out.push([out[0]![0], out[0]![1]]);
  return out;
}

/** Ellipse boundary over the object bounds, parameterized by point count. */
function sampleEllipseBoundary(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  quadrantSamples: number,
): Array<[number, number]> {
  const total = quadrantSamples * 4;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < total; i++) {
    const angle = (i * 2 * Math.PI) / total;
    out.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  out.push([out[0]![0], out[0]![1]]);
  return out;
}

/** Drop the repeated closing point when present. */
function dedupeClosingPoint(loop: Array<[number, number]>): Array<[number, number]> {
  if (loop.length > 1) {
    const first = loop[0]!;
    const last = loop[loop.length - 1]!;
    if (first[0] === last[0] && first[1] === last[1]) return loop.slice(0, -1);
  }
  return loop;
}


export class PdfLibBackend implements PdfBackend {
  private doc: PDFDocument;
  private font: PDFFont | null = null;
  private fontId: string | null = null;
  private currentPage: PDFPage | null = null;
  private currentFontKey: PDFName | null = null;
  private readonly fonts = new Map<string, PDFFont>();
  private readonly outlineFonts = new Map<string,Font>();
  private readonly fontBytes = new Map<string,Uint8Array>();
  private readonly vectorFonts = new Set<string>();
  private pathTextFont: PDFFont | null = null;
  private prefersPaths(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false;
    const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const tables=data.getUint16(4);
    if (12+16*tables > bytes.byteLength) return false;
    for(let i=0;i<tables;i++) {
      const entry=12+16*i;
      if(data.getUint32(entry)===0x4f532f32) {
        const offset=data.getUint32(entry+8);
        return offset+10<=bytes.byteLength && (data.getUint16(offset+8)&2)!==0;
      }
    }
    return false;
  }

  private async prepareFont(bytes: Uint8Array, id: string): Promise<PDFFont> {
    if (!this.prefersPaths(bytes)) return this.doc.embedFont(bytes, { subset: false });
    this.vectorFonts.add(id);
    // Native export fills these font outlines. A standard-font placeholder
    // activates ActualText without putting the original font bytes in the PDF.
    this.pathTextFont ??= await this.doc.embedFont(StandardFonts.Helvetica);
    return this.pathTextFont;
  }
  private readonly pageFontKeys = new Map<string, PDFName>();
  private readonly images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

  private constructor(doc: PDFDocument, private readonly glyphPositionDpi?: number) {
    this.doc = doc;
  }

  static async create(glyphPositionDpi?: number): Promise<PdfLibBackend> {
    if(glyphPositionDpi!==undefined && (!Number.isFinite(glyphPositionDpi) || glyphPositionDpi<=0)) {
      throw new Error("Glyph position DPI must be positive and finite");
    }
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    return new PdfLibBackend(doc,glyphPositionDpi);
  }

  async setFont(fontBytes: Uint8Array, fontId = "embedded-fallback"): Promise<void> {
    // Subsetting triggers an additional fontkit layout pass that crashes on
    // some complex Arabic fonts. Full embedding is larger but safer; ordinary
    // shaping and measurement are handled by @inpage/text-shaper.
    if (this.fonts.has(fontId)) throw new Error(`Duplicate PDF font identity: ${fontId}`);
    this.font = await this.prepareFont(fontBytes, fontId);
    this.fontId = fontId;
    this.fonts.set(fontId, this.font);
    this.fontBytes.set(fontId,fontBytes);
  }

  async registerFont(fontBytes: Uint8Array, fontId: string): Promise<void> {
    if (!fontId || this.fonts.has(fontId)) throw new Error(`Duplicate or empty PDF font identity: ${fontId}`);
    this.fonts.set(fontId, await this.prepareFont(fontBytes, fontId));
    this.fontBytes.set(fontId,fontBytes);
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
    const fontStep=this.glyphPositionDpi?72/this.glyphPositionDpi:0;
    const paintedSize=fontStep ? Math.max(fontStep,(run.fontSizeScale?Math.ceil(size/fontStep-1e-7):Math.floor(size/fontStep+1e-7))*fontStep) : size;
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
      setLineWidth(appearance.outline ? 0.72 : 0.5),
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        PDFName.of("Span"),
        `<< /ActualText ${actualText.toString()} >>`,
      ]),
      beginText(),
      setTextRenderingMode(appearance.outline ? TextRenderingMode.Invisible : TextRenderingMode.Fill),
      setFontAndSize(runFontKey, paintedSize),
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
        this.currentPage.pushOperators(setFontAndSize(key, paintedSize));
        activeFontId = glyphFontId;
      }
      this.currentPage.pushOperators(
        setTextRenderingMode(appearance.outline || this.vectorFonts.has(glyphFontId) ? TextRenderingMode.Invisible : TextRenderingMode.Fill),
        setTextMatrix(
          cosine * horizontalScale,
          sine * horizontalScale,
          -sine,
          cosine,
          ...this.glyphPosition(
            x + (penX + glyph.xOffset * scale) * horizontalScale * cosine - (penY + glyph.yOffset * scale) * sine,
            y + (penX + glyph.xOffset * scale) * horizontalScale * sine + (penY + glyph.yOffset * scale) * cosine,
          ),
        ),
        showText(PDFHexString.of(this.vectorFonts.has(glyphFontId) ? "00" : glyph.id.toString(16).padStart(4, "0"))),
      );
      penX += glyph.xAdvance * scale;
      penY += glyph.yAdvance * scale;
    }

    this.currentPage.pushOperators(endText());
    if(appearance.outline || run.glyphs.some(glyph=>this.vectorFonts.has(glyph.fontId ?? run.fontId))) {
      this.currentPage.pushOperators(setLineCap(LineCapStyle.Round),setLineJoin(LineJoinStyle.Round));
      penX=0;penY=0;
      for(const glyph of run.glyphs) {
        const id=glyph.fontId ?? run.fontId;
        if(!appearance.outline && !this.vectorFonts.has(id)) {penX+=glyph.xAdvance*scale;penY+=glyph.yAdvance*scale;continue;}
        let face=this.outlineFonts.get(id);
        if(!face){face=fontkit.create(this.fontBytes.get(id)!);this.outlineFonts.set(id,face);}
        const glyphScale=paintedSize/face.unitsPerEm;
        const transform=(a:number,b:number):[number,number]=>{
          const localX=(penX+glyph.xOffset*scale+a*glyphScale)*horizontalScale;
          const localY=penY+glyph.yOffset*scale+b*glyphScale;
          return [x+localX*cosine-localY*sine,y+localX*sine+localY*cosine];
        };
        this.currentPage.pushOperators(...glyphOutline(face.getGlyph(glyph.id).path,transform),appearance.outline ? stroke() : fill());
        penX+=glyph.xAdvance*scale;penY+=glyph.yAdvance*scale;
      }
    }
    this.currentPage.pushOperators(endMarkedContent(),popGraphicsState());
  }

  private glyphPosition(x:number,y:number):[number,number] {
    if(!this.glyphPositionDpi)return [x,y];
    const step=72/this.glyphPositionDpi, height=this.currentPage!.getHeight();
    // GDI places text in integer printer coordinates with a top-left origin.
    return [Math.floor(x/step+1e-7)*step,height-Math.floor((height-y)/step+1e-7)*step];
  }

  async drawImage(
    image: EmbeddedImage,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDegrees = 0,
    appearance:Pick<PageObject,"shape"|"borderWidth"|"borderStyle"|"imagePlacement"> = {},
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
    const placement=appearance.imagePlacement;
    // Saved picture offsets are relative to the inside of the frame border.
    const imageInset=placement ? appearance.borderWidth ?? 0 : 0;
    this.currentPage.drawImage(embedded, {
      x:x+(placement?.xOffset ?? 0)+imageInset,
      y:placement ? y+height-placement.yOffset-placement.height-imageInset : y,
      width:placement?.width ?? width,
      height:placement?.height ?? height,
      rotate: degrees(rotationDegrees),
    });
    if (appearance.shape === "ellipse") {
      this.currentPage.pushOperators(popGraphicsState());
      const thickness=Math.max(0,Math.min(appearance.borderWidth ?? 1,width,height));
      if (appearance.borderStyle === 15 && thickness>0 && thickness<Math.min(width,height)) {
        const rx=(width-thickness)/2,ry=(height-thickness)/2,cx=x+width/2,cy=y+height/2;
        this.currentPage.drawEllipse({
          x: cx,
          y: cy,
          xScale: rx,
          yScale: ry,
          borderColor: rgb(1, 1, 1),
          borderWidth: thickness,
        });
        const samples=Array.from({length:721},(_,i)=>{
          const angle=Math.PI/2+i*Math.PI/360;
          return {angle,x:cx+rx*Math.cos(angle),y:cy+ry*Math.sin(angle),distance:0};
        });
        for(let i=1;i<samples.length;i++)samples[i]!.distance=samples[i-1]!.distance+
          Math.hypot(samples[i]!.x-samples[i-1]!.x,samples[i]!.y-samples[i-1]!.y);
        const perimeter=samples.at(-1)!.distance;
        const count=Math.min(4096,Math.max(4,Math.round(perimeter/3.77)));
        let sample=1;
        this.currentPage.pushOperators(pushGraphicsState(),setFillingRgbColor(0,0,0));
        for(let i=0;i<count;i++) {
          const distance=i*perimeter/count;
          while(samples[sample]!.distance<distance)sample++;
          const left=samples[sample-1]!,right=samples[sample]!;
          const ratio=(distance-left.distance)/(right.distance-left.distance);
          const angle=left.angle+(right.angle-left.angle)*ratio;
          const px=cx+rx*Math.cos(angle),py=cy+ry*Math.sin(angle);
          const tangentX=-rx*Math.sin(angle),tangentY=ry*Math.cos(angle),norm=Math.hypot(tangentX,tangentY);
          const dx=tangentX/norm*thickness,dy=tangentY/norm*thickness;
          this.currentPage.pushOperators(moveTo(px+dx,py+dy),lineTo(px-dy/2,py+dx/2),
            lineTo(px-dx,py-dy),lineTo(px+dy/2,py-dx/2),closePath(),fill());
        }
        this.currentPage.pushOperators(popGraphicsState());
      } else if (appearance.borderStyle && thickness>0) this.currentPage.drawEllipse({x:x+width/2,y:y+height/2,
        xScale:Math.max(0.001,(width-thickness)/2),yScale:Math.max(0.001,(height-thickness)/2),
        borderColor:rgb(0,0,0),borderWidth:thickness,
      });
    }
  }

  drawLine(x1: number, y1: number, x2: number, y2: number,thickness=0.6): void {
    if (!this.currentPage) throw new Error("No page added");
    if (Math.abs(y1 - y2) < 0.01) {
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const h = (thickness ?? 0.6) * 1.6;
      this.currentPage.pushOperators(
        pushGraphicsState(),
        setFillingRgbColor(0, 0, 0),
        moveTo(minX, y1 - (h * 0.475)),
        lineTo(maxX, y1 - (h * 0.475)),
        lineTo(maxX, y1 - (h * 0.475) + h),
        lineTo(minX, y1 - (h * 0.475) + h),
        closePath(),
        moveTo(0, 0),
        lineTo(0, 0),
        closePath(),
        PDFOperator.of(PDFOperatorNames.FillEvenOdd),
        popGraphicsState(),
      );
      return;
    }
    this.currentPage.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness,
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
    const borderWidth = object.hasBorder ? Math.max(0,Math.min(object.borderWidth ?? 1,width,height)) : 0;
    const pw = borderWidth > 0 ? (object.borderWidth ? object.borderWidth * 0.96 : 0.96) : 0;
    if (object.polygon?.length) {
      if (object.polygon.length >= 3) {
        // Generic path: boundary from decoded bounds/polygon/style only, snapped
        // to the same 0.12 pt (600 dpi) device grid the native printer uses.
        const boundary = dedupeClosingPoint(computeGraphicBoundary(object))
          .map(([bx, by]): [number, number] => [snapToDevice(bx), snapToDevice(by)]);
        this.drawPolygonBoundary(boundary, pageHeight, shade, shouldFill, borderWidth, pw);
        return;
      }
    } else if (shouldFill || borderWidth) {
      if (object.kind === "text" && object.borderStyle === 1 && borderWidth > 0) {
        if (shouldFill) {
          this.currentPage.drawRectangle({x,y:pageHeight-top-height,width,height,color:rgb(shade,shade,shade)});
        }
        const effectiveTop = snapToDevice(top);
        const effectiveBottom = snapToDevice(top + height);
        const bw = 0.96;
        // Top border as compound horizontal rule
        this.currentPage.pushOperators(
          pushGraphicsState(),
          setFillingRgbColor(0,0,0),
          moveTo(x, pageHeight - effectiveTop - bw),
          lineTo(x + width, pageHeight - effectiveTop - bw),
          lineTo(x + width, pageHeight - effectiveTop),
          lineTo(x, pageHeight - effectiveTop),
          closePath(),
          moveTo(0, 0), lineTo(0, 0), closePath(),
          PDFOperator.of(PDFOperatorNames.FillEvenOdd),
          popGraphicsState(),
          // Right border
          pushGraphicsState(),
          setFillingRgbColor(0,0,0),
          moveTo(x + width - bw, pageHeight - effectiveBottom),
          lineTo(x + width, pageHeight - effectiveBottom),
          lineTo(x + width, pageHeight - effectiveTop),
          lineTo(x + width - bw, pageHeight - effectiveTop),
          closePath(),
          PDFOperator.of(PDFOperatorNames.FillEvenOdd),
          popGraphicsState(),
          // Bottom border
          pushGraphicsState(),
          setFillingRgbColor(0,0,0),
          moveTo(x, pageHeight - effectiveBottom),
          lineTo(x + width, pageHeight - effectiveBottom),
          lineTo(x + width, pageHeight - effectiveBottom + bw),
          lineTo(x, pageHeight - effectiveBottom + bw),
          closePath(),
          PDFOperator.of(PDFOperatorNames.FillEvenOdd),
          popGraphicsState(),
          // Left border
          pushGraphicsState(),
          setFillingRgbColor(0,0,0),
          moveTo(x, pageHeight - effectiveBottom),
          lineTo(x + bw, pageHeight - effectiveBottom),
          lineTo(x + bw, pageHeight - effectiveTop),
          lineTo(x, pageHeight - effectiveTop),
          closePath(),
          PDFOperator.of(PDFOperatorNames.FillEvenOdd),
          popGraphicsState()
        );
      } else {
        if (object.borderStyle !== 17) {
          this.currentPage.drawRectangle({x:x+borderWidth/2,y:pageHeight-top-height+borderWidth/2,
            width:width-borderWidth,height:height-borderWidth,borderWidth,
            ...(borderWidth ? {borderColor:rgb(0,0,0)} : {}),
            ...(shouldFill ? {color:rgb(shade,shade,shade)} : {})});
        } else if (shouldFill) {
          this.currentPage.drawRectangle({x,y:pageHeight-top-height,width,height,color:rgb(shade,shade,shade)});
        }
      }
      if (object.fillPattern === 3) {
        // A tiling brush must remain a PDF pattern: flattening it into page
        // paths changes the rasterizer's cell rounding at different resolutions.
        const context=this.doc.context,resources=this.currentPage.node.Resources() ?? context.obj({});
        this.currentPage.node.set(PDFName.of("Resources"),resources);
        const patterns=resources.lookupMaybe(PDFName.of("Pattern"),PDFDict) ?? context.obj({});
        resources.set(PDFName.of("Pattern"),patterns);
        const key=patterns.uniqueKey("InPageDiagonal");
        const tile=context.flateStream("1 g 4 7 5 2 re f 0 g 4 7 m 4.96 7 l 6.96 9 l 6 9 l h f",{
          Type:"Pattern",PatternType:1,PaintType:1,TilingType:2,BBox:[0,0,9,9],XStep:9,YStep:9,
          Matrix:[0.75,0,0,-0.75,0,pageHeight],Resources:{},
        });
        patterns.set(key,context.register(tile));
        this.currentPage.pushOperators(pushGraphicsState(),
          PDFOperator.of(PDFOperatorNames.NonStrokingColorspace,[PDFName.of("Pattern")]),
          PDFOperator.of(PDFOperatorNames.NonStrokingColorN,[key]),
          moveTo(x,pageHeight-top),
          lineTo(x+width,pageHeight-top),
          lineTo(x+width,pageHeight-top-height),
          lineTo(x,pageHeight-top-height),closePath(),fill(),popGraphicsState());
      }
      if (object.borderStyle === 17 && borderWidth > 0) {
        const bw = borderWidth;
        const startsX: number[] = [];
        if (startsX.length === 0) {
          for (let s = 1.8 * bw, stepIdx = 0; s + 3 * bw <= width; stepIdx++) {
            startsX.push(Number(s.toFixed(2)));
            s += (stepIdx % 2 === 0 ? 2.28 * bw : 2.32 * bw);
          }
        }
        const startsY: number[] = [];
        if (startsY.length === 0) {
          for (let s = 1.92 * bw, stepIdx = 0; s + 3 * bw <= height; stepIdx++) {
            startsY.push(Number(s.toFixed(2)));
            s += (stepIdx % 2 === 0 ? 2.44 * bw : 2.48 * bw);
          }
        }

        const borderOps: any[] = [];
        const addPoly = (pts: Array<[number, number]>) => {
          borderOps.push(
            pushGraphicsState(),
            setFillingRgbColor(0, 0, 0),
            moveTo(pts[0]![0], pts[0]![1]),
            ...pts.slice(1).map(p => lineTo(p[0], p[1])),
            closePath(),
            PDFOperator.of(PDFOperatorNames.FillEvenOdd),
            popGraphicsState()
          );
        };

        // Top edge
        addPoly([[x, pageHeight - top - bw], [x, pageHeight - top], [x + 2.48 * bw, pageHeight - top], [x + 1.48 * bw, pageHeight - top - bw]]);
        for (const s of startsX) {
          addPoly([[x + s, pageHeight - top - bw], [x + s + bw, pageHeight - top], [x + s + 3 * bw, pageHeight - top], [x + s + 2 * bw, pageHeight - top - bw]]);
        }
        addPoly([[x + width - 2.52 * bw, pageHeight - top - bw], [x + width - 1.52 * bw, pageHeight - top], [x + width, pageHeight - top], [x + width, pageHeight - top - bw]]);

        // Right edge
        addPoly([[x + width, pageHeight - top], [x + width - bw, pageHeight - top], [x + width - bw, pageHeight - top - 2.48 * bw], [x + width, pageHeight - top - 1.48 * bw]]);
        for (const s of startsY) {
          addPoly([[x + width, pageHeight - top - s], [x + width - bw, pageHeight - top - s - bw], [x + width - bw, pageHeight - top - s - 3 * bw], [x + width, pageHeight - top - s - 2 * bw]]);
        }
        addPoly([[x + width, pageHeight - top - (height - 2.52 * bw)], [x + width - bw, pageHeight - top - (height - 1.52 * bw)], [x + width - bw, pageHeight - top - height], [x + width, pageHeight - top - height]]);

        // Bottom edge
        addPoly([[x, pageHeight - top - height], [x, pageHeight - top - height + bw], [x + 2.48 * bw, pageHeight - top - height + bw], [x + 1.48 * bw, pageHeight - top - height]]);
        for (const s of startsX) {
          addPoly([[x + s, pageHeight - top - height], [x + s + bw, pageHeight - top - height + bw], [x + s + 3 * bw, pageHeight - top - height + bw], [x + s + 2 * bw, pageHeight - top - height]]);
        }
        addPoly([[x + width - 2.52 * bw, pageHeight - top - height], [x + width - 1.52 * bw, pageHeight - top - height + bw], [x + width, pageHeight - top - height + bw], [x + width, pageHeight - top - height]]);

        // Left edge
        addPoly([[x + bw, pageHeight - top], [x, pageHeight - top], [x, pageHeight - top - 2.48 * bw], [x + bw, pageHeight - top - 1.48 * bw]]);
        for (const s of startsY) {
          addPoly([[x + bw, pageHeight - top - s], [x, pageHeight - top - s - bw], [x, pageHeight - top - s - 3 * bw], [x + bw, pageHeight - top - s - 2 * bw]]);
        }
        addPoly([[x + bw, pageHeight - top - (height - 2.52 * bw)], [x, pageHeight - top - (height - 1.52 * bw)], [x, pageHeight - top - height], [x + bw, pageHeight - top - height]]);

        this.currentPage.pushOperators(...borderOps);
      }
    }
  }

  /** Fill and stroke a closed graphic boundary loop (decoded vertex order). */
  private drawPolygonBoundary(
    loop: Array<[number, number]>,
    pageHeight: number,
    shade: number,
    shouldFill: boolean,
    borderWidth: number,
    strokeWidth: number,
  ): void {
    const page = this.currentPage;
    if (!page) throw new Error("No page added");
    if (loop.length < 3) return;
    if (shouldFill) {
      page.pushOperators(
        pushGraphicsState(),
        setFillingRgbColor(shade, shade, shade),
        moveTo(loop[0]![0], pageHeight - loop[0]![1]),
        ...loop.slice(1).map((point) => lineTo(point[0], pageHeight - point[1])),
        closePath(),
        fill(),
        popGraphicsState(),
      );
    }
    if (borderWidth > 0) {
      const strokeOps = [
        pushGraphicsState(),
        setStrokingRgbColor(0, 0, 0),
        setLineWidth(strokeWidth),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
      ];
      for (let i = 0; i < loop.length; i++) {
        const p1 = loop[i]!;
        const p2 = loop[(i + 1) % loop.length]!;
        strokeOps.push(moveTo(p1[0], pageHeight - p1[1]), lineTo(p2[0], pageHeight - p2[1]), stroke());
      }
      strokeOps.push(popGraphicsState());
      page.pushOperators(...strokeOps);
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
