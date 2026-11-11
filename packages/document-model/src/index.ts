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
  /** Legacy codes aligned 1:1 with Unicode scalars; undefined where no single code applies. */
  charCodes?: (number | undefined)[];
  /** Native cached-layout run kind, retained for run-kind-specific shaping. */
  legacyRunKind?: number;
  styleId?: number;
  style?: TextStyle;
};

/** Source typography; distances are in points, scales are dimensionless. */
export interface TextStyle {
  fontSize: number;
  lineHeight?: number;
  paragraphBefore?: number;
  paragraphAfter?: number;
  latinFontName?: string;
  arabicFontName?: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: "left" | "center" | "justify" | "right";
  horizontalScale?: number;
  baselineShift?: number;
  trackingEm?: number;
  trackingPoints?: number;
  tabStops?: {position:number;alignment:number}[];
  outline?: boolean;
  colorIndex?: number;
}

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

export interface Story {
  /** Stable index in the content stream's story table. */
  index: number;
  paragraphs: Paragraph[];
  startOffset: number;
  endOffset: number;
  cachedLayout?: {
    frameId:number;
    columnWidth:number;
    contentHeight:number;
    columns:number;
    lines:{height:number;baseline:number;width:number;paragraphStart?:boolean;runs:{x:number;width:number;baseline?:number;characterSpacing?:number;extraSpace?:number;kashidaCount?:number;direction:"ltr"|"rtl";runs:TextRun[]}[]}[];
  };
}

export interface PageObjectBounds {
  /** Coordinates are measured from the source page's top-left corner. */
  xPoints: number;
  yPoints: number;
  widthPoints: number;
  heightPoints: number;
}

export interface PageObject {
  kind: "text" | "image" | "line" | "graphic" | "guide" | "page";
  id: number;
  bounds: PageObjectBounds;
  storyReference?: number;
  imageName?: string;
  imagePlacement?: {xOffset:number;yOffset:number;width:number;height:number};
  columnCount?: number;
  rotationDegrees?: number;
  hasBorder?: boolean;
  fillColorIndex?: number;
  borderWidth?: number;
  borderStyle?: number;
  fillPattern?: number;
  shape?: "rectangle" | "ellipse" | "polygon";
  polygon?: {x:number;y:number}[];
  sourceOffset: number;
  confidence: Confidence;
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
  stories: Story[];
  pageObjects: PageObject[];
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
  /** Render original InPage frames instead of reflowing extracted paragraphs. */
  preserveLayout?: boolean;
  /** Optional physical output sheet; source objects remain top-left anchored. */
  outputPageSize?: {
    widthPoints: number;
    heightPoints: number;
  };
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
