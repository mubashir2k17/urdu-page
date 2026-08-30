/** Backend-neutral abstraction for PDF generation. */
export interface PdfBackend {
  addPage(width: number, height: number): void;
  measureText(text: string, size: number): number;
  drawTextRtl(text: string, x: number, y: number, size: number): void;
  save(): Promise<Uint8Array>;
}

export type { PdfBackend as PdfBackendType };
