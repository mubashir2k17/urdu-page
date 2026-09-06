import type {
  InPageDocument,
  InspectionReport,
  ExtractedText,
  RenderPdfOptions,
} from "@inpage/document-model";
import {
  openInPage as parseOpenInPage,
  inspectInPage as parseInspectInPage,
  extractText as parseExtractText,
} from "@inpage/inp-parser";
import type { OpenInPageOptions } from "@inpage/inp-parser";
import { renderPdf as renderPdfImpl } from "@inpage/pdf-renderer";
import type { FallbackFont, RenderTypography } from "@inpage/pdf-renderer";
export type { RenderTypography } from "@inpage/pdf-renderer";

export type {
  InPageDocument,
  InspectionReport,
  ExtractedText,
  RenderPdfOptions,
} from "@inpage/document-model";

export { registerFontProvider, type FontProvider } from "@inpage/pdf-renderer";

export interface ConverterOptions {
  open?: OpenInPageOptions;
  fallbackFont?: FallbackFont;
}

export async function openInPage(
  data: Uint8Array,
  options: OpenInPageOptions = {},
): Promise<InPageDocument> {
  return parseOpenInPage(data, options);
}

export async function inspectInPage(data: Uint8Array): Promise<InspectionReport> {
  return parseInspectInPage(data);
}

export function extractText(document: InPageDocument, options?: unknown): ExtractedText {
  return parseExtractText(document, options as never);
}

export async function renderPdf(
  document: InPageDocument,
  options: RenderPdfOptions,
  fallbackFont?: FallbackFont,
  typography?: RenderTypography,
): Promise<Uint8Array> {
  const font = fallbackFont ?? _defaultFallbackFont;
  const result = await renderPdfImpl(document, options, font, typography);
  return result.bytes;
}

let _defaultFallbackFont: FallbackFont | undefined;

export function setDefaultFallbackFont(font: FallbackFont): void {
  _defaultFallbackFont = font;
}
