import type { InPageDocument, RenderPdfOptions } from "@inpage/document-model";
import { createDiagnosticCollector } from "@inpage/diagnostics";
import { HarfBuzzTextShaper, type ShapedRun } from "@inpage/text-shaper";
import {
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_MARGIN,
  DEFAULT_PAGE_WIDTH,
  resolvePageBox,
} from "@inpage/layout-engine";
import { PdfLibBackend } from "./pdflib-backend.js";
import { resolveProvidedFont } from "./font-provider.js";
import type { PdfBackend } from "./backend.js";
import { renderPositionedPage } from "./positioned-layout.js";

export const A4_WIDTH = DEFAULT_PAGE_WIDTH;
export const A4_HEIGHT = DEFAULT_PAGE_HEIGHT;
export const MARGIN = DEFAULT_PAGE_MARGIN;

export interface RenderPdfResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface FallbackFont {
  getBytes(): Promise<Uint8Array>;
}

/** A simple built-in fallback font loader (reads from the filesystem in Node). */
export class NodeFallbackFont implements FallbackFont {
  constructor(private readonly load: () => Promise<Uint8Array>) {}
  getBytes(): Promise<Uint8Array> {
    return this.load();
  }
}

export async function renderPdf(
  document: InPageDocument,
  options: RenderPdfOptions,
  fallbackFont?: FallbackFont,
): Promise<RenderPdfResult> {
  const diagnostics = createDiagnosticCollector();

  if (options.preservePageSize && !document.pageSetup) {
    diagnostics.info(
      "pagination",
      "INP_PAGE_SIZE_UNKNOWN",
      "Original page size not yet decoded for v1; using A4",
    );
  }

  const fontBytes = fallbackFont
    ? await fallbackFont.getBytes()
    : await resolveProvidedFont(document.fonts.map(({ name }) => name));
  if (!fontBytes) {
    throw new Error(
      "No font configured. Pass a fallbackFont or register a FontProvider.",
    );
  }
  const backend = await PdfLibBackend.create();
  const shapeFont = { id: "embedded-fallback", bytes: fontBytes };
  await backend.setFont(fontBytes, shapeFont.id);
  const shaper = new HarfBuzzTextShaper();
  const shapedRuns = new Map<string, ShapedRun>();
  const shape = (text: string, direction: "ltr" | "rtl" = "rtl"): ShapedRun => {
    const cacheKey = `${direction}:${text}`;
    const cached = shapedRuns.get(cacheKey);
    if (cached) return cached;
    const run = shaper.shape({
      text,
      font: shapeFont,
      direction,
      language: direction === "rtl" ? "ur" : "en",
      script: direction === "rtl" ? "arab" : "latn",
    });
    shapedRuns.set(cacheKey, run);
    return run;
  };

  const pageBox = resolvePageBox(options.preservePageSize ? document.pageSetup : undefined);
  const pageWidth = options.outputPageSize?.widthPoints ?? pageBox.width;
  const pageHeight = options.outputPageSize?.heightPoints ?? pageBox.height;
  const contentWidth = pageBox.content.width;
  let emittedPageCount = 0;
  const addPage = (): void => {
    backend.addPage(pageWidth, pageHeight);
    emittedPageCount++;
  };

  if (options.preserveLayout && document.pageObjects.length > 0 && document.stories.length > 0) {
    addPage();
    await renderPositionedPage(document, backend, pageHeight, shape);
    const bytes = await backend.save();
    return { bytes, pageCount: emittedPageCount };
  }

  // Group paragraphs into pages by the document's page structure.
  const pages = document.pages.length > 0 ? document.pages : [{ index: 0, paragraphs: document.paragraphs }];

  for (const page of pages) {
    addPage();
    let y = pageBox.content.top;
    const fontSize = 12;
    const lineHeight = fontSize * 1.6;

    for (const paragraph of page.paragraphs) {
      const text = paragraph.runs.map((r) => r.text).join("");
      if (text.trim().length === 0) {
        y -= lineHeight;
        continue;
      }

      // Wrap text into lines (simple greedy word wrap, RTL-aware for display).
      const lines = wrapText(text, contentWidth, (candidate) =>
        backend.measureShapedRun(shape(candidate), fontSize),
      );

      for (const line of lines) {
        if (y < pageBox.content.bottom) {
          addPage();
          y = pageBox.content.top;
        }
        // Draw RTL: anchor to the right edge.
        const shapedLine = shape(line);
        const x = pageBox.content.right - backend.measureShapedRun(shapedLine, fontSize);
        backend.drawShapedRun(shapedLine, x, y, fontSize);
        y -= lineHeight;
      }
      y -= lineHeight * 0.5; // paragraph spacing
    }
  }

  const bytes = await backend.save();
  return { bytes, pageCount: emittedPageCount };
}

function wrapText(
  text: string,
  maxWidth: number,
  measureText: (text: string) => number,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [text];
  const lines: string[] = [];
  let current = "";
  let currentWidth = 0;
  const spaceWidth = measureText(" ");
  for (const word of words) {
    const wordWidth = measureText(word);
    const candidateWidth = current.length === 0 ? wordWidth : currentWidth + spaceWidth + wordWidth;
    if (candidateWidth > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
      currentWidth = wordWidth;
    } else {
      current = current.length === 0 ? word : `${current} ${word}`;
      currentWidth = candidateWidth;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
