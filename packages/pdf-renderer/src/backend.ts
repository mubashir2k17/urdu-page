import type { ShapedRun } from "@inpage/text-shaper";
import type { EmbeddedImage, PageObject } from "@inpage/document-model";
export interface TextAppearance {horizontalScale?:number;outline?:boolean;colorIndex?:number}

/** Backend-neutral abstraction for PDF generation. */
export interface PdfBackend {
  addPage(width: number, height: number): void;
  measureShapedRun(run: ShapedRun, size: number): number;
  drawShapedRun(run: ShapedRun, x: number, y: number, size: number, rotationDegrees?: number, appearance?:TextAppearance): void;
  drawImage(
    image: EmbeddedImage,
    x: number,
    y: number,
    width: number,
    height: number,
    rotationDegrees?: number,
    appearance?:Pick<PageObject,"shape"|"borderWidth"|"borderStyle">,
  ): Promise<void>;
  drawLine(x1: number, y1: number, x2: number, y2: number): void;
  drawRectangle(x: number, y: number, width: number, height: number): void;
  drawGraphic?(object:PageObject,pageHeight:number): void;
  save(): Promise<Uint8Array>;
}

export type { PdfBackend as PdfBackendType };
