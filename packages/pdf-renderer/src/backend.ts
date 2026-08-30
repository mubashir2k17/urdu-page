import type { ShapedRun } from "@inpage/text-shaper";

/** Backend-neutral abstraction for PDF generation. */
export interface PdfBackend {
  addPage(width: number, height: number): void;
  measureShapedRun(run: ShapedRun, size: number): number;
  drawShapedRun(run: ShapedRun, x: number, y: number, size: number): void;
  save(): Promise<Uint8Array>;
}

export type { PdfBackend as PdfBackendType };
