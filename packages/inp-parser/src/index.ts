import { readCfb } from "@inpage/cfb";
import type { CfbFile, CfbStream } from "@inpage/cfb";
import { createDiagnosticCollector } from "@inpage/diagnostics";
import type { Diagnostic } from "@inpage/diagnostics";
import type {
  InPageDocument,
  InPageVersion,
  InspectionReport,
  StreamInfo,
  UnknownRecord,
  ExtractedText,
  DocumentOptions,
} from "@inpage/document-model";

import { validateInPageFile } from "./security.js";
import { detectVersion } from "./detect-version.js";
import { decodeLegacy } from "./legacy-decode.js";
import { decodeV3 } from "./v3-decode.js";
import { detectRecordFraming, findTextRegions } from "./records.js";
import { extractFonts, extractColors, extractMetadata } from "./metadata.js";
import { extractImages } from "./images.js";
import { extractPageSetup } from "./page-setup.js";
import { extractPageObjects } from "./page-objects.js";
import { decodeStories } from "./stories.js";
import { decodeStyledStories } from "./styled-stories.js";

export interface OpenInPageOptions extends Partial<DocumentOptions> {
  mode?: "urdu" | "arabic";
}

export function inspectInPage(data: Uint8Array): InspectionReport {
  validateInPageFile(data);
  const cfb = readCfb(data);
  const diagnostics = createDiagnosticCollector();
  const version = detectVersion(cfb);

  const streams = cfb.streams.map((s): StreamInfo => ({
    name: s.name,
    path: s.path,
    offsets: s.offsets,
    size: s.size,
  }));

  const contentStream = getContentStream(cfb, version);
  const pageSetup = version === 1 && contentStream ? extractPageSetup(contentStream.bytes) : undefined;
  const fonts = contentStream ? extractFonts(contentStream.bytes) : [];
  const colors = contentStream ? extractColors(contentStream.bytes) : [];
  const docInfo = cfb.byPath.get("DocumentInfo");
  const metadata = docInfo ? extractMetadata(docInfo.bytes) : { confidence: "low" as const };
  const images = extractImages(cfb.streams);
  const pageObjects = contentStream ? extractPageObjects(contentStream.bytes) : [];

  if (version === null) {
    diagnostics.warn("parsing", "INP_NO_VERSION", "No InPage100/200/300 content stream found");
  }

  return {
    version,
    streams,
    ...(pageSetup ? { pageSetup } : {}),
    fonts,
    colors,
    metadata,
    images,
    diagnostics: diagnostics.diagnostics,
  };
}

export function openInPage(
  data: Uint8Array,
  options: OpenInPageOptions = {},
): InPageDocument {
  validateInPageFile(data);
  const cfb = readCfb(data);
  const diagnostics = createDiagnosticCollector();
  const version = detectVersion(cfb);

  const streams = cfb.streams.map((s): StreamInfo => ({
    name: s.name,
    path: s.path,
    offsets: s.offsets,
    size: s.size,
  }));

  const contentStream = getContentStream(cfb, version);
  const pageSetup = version === 1 && contentStream ? extractPageSetup(contentStream.bytes) : undefined;
  const docInfo = cfb.byPath.get("DocumentInfo");
  const fonts = contentStream ? extractFonts(contentStream.bytes) : [];
  const colors = contentStream ? extractColors(contentStream.bytes) : [];
  const metadata = docInfo ? extractMetadata(docInfo.bytes) : { confidence: "low" as const };
  const images = extractImages(cfb.streams);
  const pageObjects = contentStream ? extractPageObjects(contentStream.bytes) : [];

  if (version === null) {
    diagnostics.error("parsing", "INP_NO_VERSION", "No InPage100/200/300 content stream found");
    return {
      version: 0 as InPageVersion,
      sourceStreams: streams,
      metadata,
      fonts,
      colors,
      pages: [],
      paragraphs: [],
      stories: [],
      pageObjects,
      images,
      unknownRecords: [],
      diagnostics: diagnostics.diagnostics,
      sourceSize: data.length,
    };
  }

  // Decode content stream.
  let paragraphs: InPageDocument["paragraphs"] = [];
  let stories: InPageDocument["stories"] = [];
  let pageBreakBefore = new Set<number>();
  let decodeDiagnostics: Diagnostic[] = [];
  const styled = version === 1 && contentStream
    ? decodeStyledStories(contentStream.bytes, options.mode ?? "urdu") : undefined;

  if (version === 3) {
    const result = decodeV3(contentStream!.bytes);
    paragraphs = result.paragraphs;
    decodeDiagnostics = result.diagnostics;
  } else if (styled) {
    stories = styled.stories;
    paragraphs = styled.paragraphs;
  } else {
    // v1/v2: the content stream is flat `04 XX` content plus ASCII, but it may
    // be preceded by binary preambles (font/color tables, style blocks) and
    // followed by non-text data (images, zero fill). Locate the dense-text
    // regions and decode those; the `0D <len:u32 LE>` record headers inside
    // are handled naturally as paragraph breaks.
    const framingStart = detectRecordFraming(contentStream!.bytes);
    let decodeSource = contentStream!.bytes;
    if (framingStart !== null) {
      const regions = findTextRegions(contentStream!.bytes, framingStart);
      const regionBytes = regions.reduce((n, r) => n + (r.end - r.start), 0);
      if (regions.length > 0 && regionBytes >= contentStream!.bytes.length * 0.02) {
        const joined = new Uint8Array(regionBytes);
        let off = 0;
        for (const r of regions) {
          joined.set(contentStream!.bytes.subarray(r.start, r.end), off);
          off += r.end - r.start;
        }
        decodeSource = joined;
        const decodedStories = decodeStories(
          contentStream!.bytes,
          regions,
          options.mode ?? "urdu",
        );
        stories = decodedStories.stories;
        paragraphs = decodedStories.paragraphs;
      } else {
        diagnostics.warn(
          "parsing",
          "INP_NO_TEXT_REGION",
          "No dense text region found after the delimiter; decoding the whole stream flat",
        );
      }
    }
    if (stories.length === 0) {
      const result = decodeLegacy(decodeSource, { mode: options.mode ?? "urdu" });
      paragraphs = result.paragraphs;
      pageBreakBefore = result.pageBreakBefore;
      decodeDiagnostics = result.diagnostics;
    }
  }

  for (const d of decodeDiagnostics) {
    if (d.severity === "error") diagnostics.error(d.category, d.code, d.message, d);
    else if (d.severity === "warning") diagnostics.warn(d.category, d.code, d.message, d);
    else diagnostics.info(d.category, d.code, d.message, d);
  }

  // Build pages by page breaks.
  const pages: InPageDocument["pages"] = [];
  let currentPage: InPageDocument["pages"][number] = { index: 0, paragraphs: [] };
  for (const p of paragraphs) {
    if (pageBreakBefore.has(p.index) && currentPage.paragraphs.length > 0) {
      pages.push(currentPage);
      currentPage = { index: pages.length, paragraphs: [] };
    }
    currentPage.paragraphs.push(p);
  }
  if (currentPage.paragraphs.length > 0 || paragraphs.length === 0) {
    pages.push(currentPage);
  }

  // Unknown records: streams we did not classify.
  const knownStreamNames = new Set([
    "InPage100",
    "InPage200",
    "InPage300",
    "DocumentInfo",
  ]);
  const unknownRecords: UnknownRecord[] = cfb.streams
    .filter((s) => !knownStreamNames.has(s.name) && !/^PPicts[0-9a-f]*$/i.test(s.name))
    .map((s) => ({
      name: s.name,
      bytes: s.bytes,
      offsets: s.offsets,
      confidence: "low" as const,
      note: "Unrecognized stream retained for future decoding",
    }));

  return {
    version,
    sourceStreams: streams,
    metadata,
    fonts,
    colors,
    pages,
    ...(pageSetup ? { pageSetup } : {}),
    paragraphs,
    stories,
    pageObjects,
    images,
    unknownRecords,
    diagnostics: diagnostics.diagnostics,
    sourceSize: data.length,
  };
}

export function extractText(
  document: InPageDocument,
  _options: { pageBreaks?: boolean } = {},
): ExtractedText {
  const paragraphs: string[] = [];
  const parts: string[] = [];
  for (const p of document.paragraphs) {
    const text = p.runs.map((r) => r.text).join("");
    paragraphs.push(text);
    parts.push(text);
  }
  return {
    paragraphs,
    raw: parts.join("\n\n"),
    diagnostics: document.diagnostics,
  };
}

function getContentStream(cfb: CfbFile, version: InPageVersion | null): CfbStream | undefined {
  if (version === null) return undefined;
  const names = ["InPage300", "InPage200", "InPage100"] as const;
  for (const name of names) {
    const s = cfb.byPath.get(name);
    if (s) return s;
  }
  return undefined;
}
