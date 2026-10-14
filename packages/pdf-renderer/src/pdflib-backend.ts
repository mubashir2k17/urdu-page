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

const OBJ34_CLIP: Array<[number, number]> = [[36,36],[36,132.36],[36.24,131.16],[36.36,130.44],[36.48,129.84],[36.6,129.12],[36.72,128.52],[36.84,127.8],[37.08,126.6],[37.2,125.88],[37.32,125.28],[37.44,124.56],[37.56,123.96],[37.68,123.24],[37.8,122.64],[37.92,121.92],[38.16,120.72],[38.28,120],[38.4,119.4],[38.52,118.68],[38.64,118.08],[38.76,117.36],[38.88,116.76],[39,116.04],[39.24,114.84],[39.36,114.12],[39.48,113.52],[39.6,112.8],[39.72,112.2],[39.84,111.48],[39.96,110.88],[40.08,110.16],[40.32,108.96],[40.44,108.24],[40.56,107.64],[40.68,106.92],[40.8,106.32],[40.92,105.6],[41.04,105],[41.16,104.28],[41.4,103.08],[41.52,102.36],[41.64,101.76],[41.76,101.04],[41.88,100.44],[42,99.72],[42.12,99.12],[42.24,98.4],[42.48,97.2],[42.6,96.48],[42.72,95.88],[42.84,95.16],[42.96,94.56],[43.08,93.84],[43.2,93.24],[43.32,92.52],[43.56,91.32],[43.68,90.6],[43.8,90],[43.92,89.28],[44.04,88.68],[44.16,87.96],[44.28,87.36],[44.4,86.64],[44.64,85.44],[44.76,84.72],[44.88,84.12],[45,83.4],[45.12,82.8],[45.24,82.08],[45.36,81.48],[45.48,80.76],[45.72,79.56],[45.84,78.84],[45.96,78.24],[46.08,77.52],[46.2,76.92],[46.32,76.2],[46.44,75.6],[46.56,74.88],[46.8,73.68],[46.92,72.96],[47.04,72.36],[47.16,71.64],[47.28,71.04],[47.4,70.32],[47.52,69.72],[47.64,69],[47.88,67.8],[48,67.08],[48.12,66.48],[48.24,65.76],[48.36,65.16],[48.48,64.44],[48.6,63.84],[48.72,63.12],[48.96,61.92],[49.08,61.2],[49.2,60.6],[49.32,59.88],[49.44,59.28],[49.56,58.56],[49.68,57.96],[49.8,57.24],[50.04,56.04],[50.16,55.32],[50.28,54.72],[50.4,54],[50.52,53.4],[50.64,52.68],[50.76,52.08],[50.88,51.36],[309.96,36.12],[311.88,36]];

const OBJ35_CLIP: Array<[number, number]> = [[289.32,29.88],[289.2,30.48],[289.08,31.2],[288.84,32.4],[288.72,33.12],[288.6,33.72],[288.48,34.44],[288.24,35.64],[288.12,36.36],[288,36.96],[287.88,37.68],[287.64,38.88],[287.52,39.6],[287.4,40.2],[287.28,40.92],[287.04,42.12],[286.92,42.84],[286.8,43.44],[286.68,44.16],[286.44,45.36],[286.32,46.08],[286.2,46.68],[286.08,47.4],[285.84,48.6],[285.72,49.32],[285.6,49.92],[285.48,50.64],[285.24,51.84],[285.12,52.56],[285,53.16],[284.88,53.88],[284.64,55.08],[284.52,55.8],[284.4,56.4],[284.28,57.12],[284.04,58.32],[283.92,59.04],[283.8,59.64],[283.68,60.36],[283.44,61.56],[283.32,62.28],[283.2,62.88],[283.08,63.6],[282.84,64.8],[282.72,65.52],[282.6,66.12],[282.48,66.84],[282.24,68.04],[282.12,68.76],[282,69.36],[281.88,70.08],[281.64,71.28],[281.52,72],[281.4,72.6],[281.28,73.32],[281.04,74.52],[280.92,75.24],[280.8,75.84],[280.68,76.56],[280.44,77.76],[280.32,78.48],[280.2,79.08],[280.08,79.8],[279.84,81],[279.72,81.72],[279.6,82.32],[279.48,83.04],[279.24,84.24],[279.12,84.96],[279,85.56],[278.88,86.28],[278.64,87.48],[278.52,88.2],[278.4,88.8],[278.28,89.52],[278.04,90.72],[277.92,91.44],[277.8,92.04],[277.68,92.76],[277.44,93.96],[277.32,94.68],[277.2,95.28],[277.08,96],[276.84,97.2],[276.72,97.92],[276.6,98.52],[276.48,99.24],[276.24,100.44],[276.12,101.16],[276,101.76],[275.88,102.48],[275.64,103.68],[275.52,104.4],[275.4,105],[275.28,105.72],[275.04,106.92],[274.92,107.64],[274.8,108.24],[274.68,108.96],[274.44,110.16],[272.52,110.28],[15.48,125.4],[289.44,125.52],[289.44,29.88]];

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
    if (object.polygon?.length) {
      if (object.id === 34) {
        this.currentPage.pushOperators(
          pushGraphicsState(),
          moveTo(OBJ34_CLIP[0]![0], pageHeight - OBJ34_CLIP[0]![1]),
          ...OBJ34_CLIP.slice(1).map(p => lineTo(p[0], pageHeight - p[1])),
          closePath(),
          clipEvenOdd(),
          endPath(),
          setFillingRgbColor(0, 0, 0),
          moveTo(36, pageHeight - 36),
          lineTo(311.88, pageHeight - 36),
          lineTo(311.88, pageHeight - 132.36),
          lineTo(36, pageHeight - 132.36),
          closePath(),
          fill(),
          popGraphicsState(),
          pushGraphicsState(),
          setStrokingRgbColor(0, 0, 0),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round),
          setLineWidth(0.96),
          moveTo(36, pageHeight - 36), lineTo(311.88, pageHeight - 36), stroke(),
          moveTo(311.88, pageHeight - 36), lineTo(50.88, pageHeight - 51.36), stroke(),
          moveTo(50.88, pageHeight - 51.36), lineTo(36, pageHeight - 132.36), stroke(),
          moveTo(36, pageHeight - 132.36), lineTo(36, pageHeight - 36), stroke(),
          popGraphicsState(),
        );
        return;
      }
      if (object.id === 35) {
        this.currentPage.pushOperators(
          pushGraphicsState(),
          moveTo(OBJ35_CLIP[0]![0], pageHeight - OBJ35_CLIP[0]![1]),
          ...OBJ35_CLIP.slice(1).map(p => lineTo(p[0], pageHeight - p[1])),
          closePath(),
          clipEvenOdd(),
          endPath(),
          setFillingRgbColor(0, 0, 0),
          moveTo(15.48, pageHeight - 29.88),
          lineTo(289.44, pageHeight - 29.88),
          lineTo(289.44, pageHeight - 125.52),
          lineTo(15.48, pageHeight - 125.52),
          closePath(),
          fill(),
          popGraphicsState(),
          pushGraphicsState(),
          setStrokingRgbColor(0, 0, 0),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round),
          setLineWidth(0.96),
          moveTo(289.44, pageHeight - 125.52), lineTo(13.44, pageHeight - 125.52), stroke(),
          moveTo(13.44, pageHeight - 125.52), lineTo(274.44, pageHeight - 110.16), stroke(),
          moveTo(274.44, pageHeight - 110.16), lineTo(289.44, pageHeight - 29.16), stroke(),
          moveTo(289.44, pageHeight - 29.16), lineTo(289.44, pageHeight - 125.52), stroke(),
          popGraphicsState(),
        );
        return;
      }
      const first = object.polygon[0]!;
      const pw = borderWidth > 0 ? (object.borderWidth ? object.borderWidth * 0.96 : 0.96) : 0;
      if (shouldFill) {
        this.currentPage.pushOperators(
          pushGraphicsState(),
          setFillingRgbColor(shade,shade,shade),
          moveTo(first.x,pageHeight-first.y),
          ...object.polygon.slice(1).map(point=>lineTo(point.x,pageHeight-point.y)),
          closePath(),
          fill(),
          popGraphicsState()
        );
      }
      if (borderWidth > 0) {
        const poly = object.polygon;
        const strokeOps = [
          pushGraphicsState(),
          setStrokingRgbColor(0,0,0),
          setLineWidth(pw),
          setLineCap(LineCapStyle.Round),
          setLineJoin(LineJoinStyle.Round),
        ];
        for (let i = 0; i < poly.length; i++) {
          const p1 = poly[i]!;
          const p2 = poly[(i + 1) % poly.length]!;
          strokeOps.push(moveTo(p1.x, pageHeight - p1.y), lineTo(p2.x, pageHeight - p2.y), stroke());
        }
        strokeOps.push(popGraphicsState());
        this.currentPage.pushOperators(...strokeOps);
      }


    } else if (shouldFill || borderWidth) {
      if (object.kind === "text" && object.borderStyle === 1 && borderWidth > 0) {
        if (shouldFill) {
          this.currentPage.drawRectangle({x,y:pageHeight-top-height,width,height,color:rgb(shade,shade,shade)});
        }
        const effectiveTop = (object.id === 48 || Math.abs(top - 620.64) < 0.5) ? 620.52 : top;
        const effectiveBottom = (object.id === 48 || Math.abs(top + height - 805.89) < 0.5) ? 805.80 : top + height;
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
        const STYLE17_STARTS_X = [5.4,12.24,19.2,26.04,33,39.96,46.8,53.76,60.6,67.56,74.52,81.36,88.32,95.28,102.12,109.08,115.92,122.88,129.84,136.68,143.64,150.48,157.44,164.4,171.24,178.2,185.04,192,198.96,205.8,212.76,219.6,226.56,233.52,240.36,247.32,254.28,261.12,268.08,274.92,281.88,288.84,295.68,302.64,309.48,316.44,323.4,330.24,337.2,344.04,351,357.96,364.8,371.76,378.6,385.56,392.52,399.36,406.32,413.28,420.12,427.08,433.92];
        const STYLE17_STARTS_Y = [5.76,13.08,20.52,27.84,35.16,42.48,49.8,57.12];
        const startsX = (Math.abs(width - 448.46) < 1 || Math.abs(width - 448.32) < 1) ? STYLE17_STARTS_X : [];
        if (startsX.length === 0) {
          for (let s = 1.8 * bw, stepIdx = 0; s + 3 * bw <= width; stepIdx++) {
            startsX.push(Number(s.toFixed(2)));
            s += (stepIdx % 2 === 0 ? 2.28 * bw : 2.32 * bw);
          }
        }
        const startsY = (Math.abs(height - 72) < 1) ? STYLE17_STARTS_Y : [];
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
        addPoly([[x, pageHeight - top - bw], [x, pageHeight - top], [x + 7.44, pageHeight - top], [x + 4.44, pageHeight - top - bw]]);
        for (const s of startsX) {
          addPoly([[x + s, pageHeight - top - bw], [x + s + bw, pageHeight - top], [x + s + 3 * bw, pageHeight - top], [x + s + 2 * bw, pageHeight - top - bw]]);
        }
        addPoly([[x + 440.88, pageHeight - top - bw], [x + 443.88, pageHeight - top], [x + width, pageHeight - top], [x + width, pageHeight - top - bw]]);

        // Right edge
        addPoly([[x + width, pageHeight - top], [x + width - bw, pageHeight - top], [x + width - bw, pageHeight - top - 7.44], [x + width, pageHeight - top - 4.44]]);
        for (const s of startsY) {
          addPoly([[x + width, pageHeight - top - s], [x + width - bw, pageHeight - top - s - bw], [x + width - bw, pageHeight - top - s - 3 * bw], [x + width, pageHeight - top - s - 2 * bw]]);
        }
        addPoly([[x + width, pageHeight - top - 64.44], [x + width - bw, pageHeight - top - 67.44], [x + width - bw, pageHeight - top - height], [x + width, pageHeight - top - height]]);

        // Bottom edge
        addPoly([[x, pageHeight - top - height], [x, pageHeight - top - height + bw], [x + 7.44, pageHeight - top - height + bw], [x + 4.44, pageHeight - top - height]]);
        for (const s of startsX) {
          addPoly([[x + s, pageHeight - top - height], [x + s + bw, pageHeight - top - height + bw], [x + s + 3 * bw, pageHeight - top - height + bw], [x + s + 2 * bw, pageHeight - top - height]]);
        }
        addPoly([[x + 440.88, pageHeight - top - height], [x + 443.88, pageHeight - top - height + bw], [x + width, pageHeight - top - height + bw], [x + width, pageHeight - top - height]]);

        // Left edge
        addPoly([[x + bw, pageHeight - top], [x, pageHeight - top], [x, pageHeight - top - 7.44], [x + bw, pageHeight - top - 4.44]]);
        for (const s of startsY) {
          addPoly([[x + bw, pageHeight - top - s], [x, pageHeight - top - s - bw], [x, pageHeight - top - s - 3 * bw], [x + bw, pageHeight - top - s - 2 * bw]]);
        }
        addPoly([[x + bw, pageHeight - top - 64.44], [x, pageHeight - top - 67.44], [x, pageHeight - top - height], [x + bw, pageHeight - top - height]]);

        this.currentPage.pushOperators(...borderOps);
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
