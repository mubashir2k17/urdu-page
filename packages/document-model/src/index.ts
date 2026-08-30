import type { Diagnostic } from "@inpage/diagnostics";

export type InPageVersion = 1 | 2 | 3;

export type Confidence = "high" | "medium" | "low" | "speculative";

export interface StreamInfo {
  /** Stream name, e.g. "InPage100". */
  name: string;
  /** Normalized path within the CFB container. */
  path: string;
  /** Raw byte offset(s) of the stream's sectors in the file. */
  offsets: number[];
  size: number;
}

export interface FontRecord {
  name: string;
  /** Index into the document's font table. */
  index: number;
  confidence: Confidence;
}

export interface ColorRecord {
  name: string;
  r: number;
  g: number;
  b: number;
  confidence: Confidence;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  pageCount?: number;
  confidence: Confidence;
}

export interface EmbeddedImage {
  /** Stream name or synthetic id, e.g. "PPicts1". */
  name: string;
  format: "dib" | "jpeg" | "png" | "unknown";
  bytes: Uint8Array;
  /** Byte offset within the source file/stream. */
  offset: number;
  width?: number;
  height?: number;
  confidence: Confidence;
}

export interface UnknownRecord {
  /** Stream name or synthetic id. */
  name: string;
  bytes: Uint8Array;
  offsets: number[];
  confidence: Confidence;
  note: string;
}

export type TextRun = {
  kind: "text";
  text: string;
  /** InPage character codes (second byte of `04 XX` pairs), for diagnostics. */
  rawCodes?: number[];
  styleId?: number;
};

export interface Paragraph {
  index: number;
  runs: TextRun[];
  /** Byte offset in the decoded stream where the paragraph started. */
  startOffset: number;
  /** Byte offset in the decoded stream where the paragraph ended. */
  endOffset: number;
  /** Style id associated with the paragraph's first run, if known. */
  styleId?: number;
}

export interface Page {
  index: number;
  paragraphs: Paragraph[];
}

export interface PageSetup {
  widthPoints: number;
  heightPoints: number;
  margins: {
    leftPoints: number;
    topPoints: number;
    rightPoints: number;
    bottomPoints: number;
  };
  /** Byte offset of the width tag in the InPage content stream. */
  sourceOffset: number;
  confidence: Confidence;
}

export interface InPageDocument {
  version: InPageVersion;
  sourceStreams: StreamInfo[];
  metadata: DocumentMetadata;
  fonts: FontRecord[];
  colors: ColorRecord[];
  pages: Page[];
  pageSetup?: PageSetup;
  paragraphs: Paragraph[];
  images: EmbeddedImage[];
  unknownRecords: UnknownRecord[];
  diagnostics: readonly Diagnostic[];
  /** Original input byte length. */
  sourceSize: number;
}

export interface DocumentOptions {
  strict: boolean;
}

export interface RenderPdfOptions {
  preservePageSize: boolean;
  embedFonts: boolean;
  searchableText: boolean;
}

export interface ExtractedText {
  paragraphs: string[];
  /** Paragraph/page break markers embedded inline. */
  raw: string;
  diagnostics: readonly Diagnostic[];
}

export interface InspectionReport {
  version: InPageVersion | null;
  streams: StreamInfo[];
  pageSetup?: PageSetup;
  fonts: FontRecord[];
  colors: ColorRecord[];
  metadata: DocumentMetadata;
  images: EmbeddedImage[];
  diagnostics: readonly Diagnostic[];
}
