// Offline spacing priors from a reference PDF's content streams.
//
// Parses Tc (character spacing), Tw (word spacing), and TJ (kerning arrays)
// operators. These are measurement evidence for stretch-zone defaults; the
// renderer never reads reference PDFs at render time (ADR-020 / ADR-019).

import { readFileSync } from "node:fs";

import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";

export interface NumberSummary {
  count: number;
  mean: number;
  median: number;
  p95Abs: number;
}

export interface SpacingOperators {
  tc: number[];
  tw: number[];
  tj: number[];
}

export interface PageSpacingPriors extends SpacingOperators {
  page: number;
  tcSummary: NumberSummary;
  twSummary: NumberSummary;
  tjSummary: NumberSummary;
}

export interface SpacingPriorsReport {
  source: string;
  pages: PageSpacingPriors[];
  overall: {
    tc: NumberSummary;
    tw: NumberSummary;
    tj: NumberSummary;
  };
}

export interface RendererSpacingPriors {
  characterSpacing?: number;
  wordSpacing?: number;
}

/**
 * Convert extracted Tc/Tw medians into the renderer's per-document prior
 * shape. TJ kerning is reported but not mapped to a single scale.
 */
export function toRendererSpacingPriors(
  report: Pick<SpacingPriorsReport, "overall">,
): RendererSpacingPriors {
  return {
    ...(report.overall.tc.count ? {characterSpacing: report.overall.tc.median} : {}),
    ...(report.overall.tw.count ? {wordSpacing: report.overall.tw.median} : {}),
  };
}

const NUMBER = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)`;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function summarize(values: readonly number[]): NumberSummary {
  const count = values.length;
  return {
    count,
    mean: count ? values.reduce((sum, value) => sum + value, 0) / count : 0,
    median: median(values),
    p95Abs: count
      ? [...values].map(Math.abs).sort((left, right) => left - right)[
        Math.min(count - 1, Math.floor(count * 0.95))
      ]!
      : 0,
  };
}

/** Strip PDF string literals and hex strings so digits inside text are ignored. */
function stripStrings(array: string): string {
  return array
    .replace(/\((?:\\.|[^\\()])*\)/g, " ")
    .replace(/<[0-9A-Fa-f\s]*>/g, " ");
}

export function parseSpacingOperators(content: string): SpacingOperators {
  const tc = [...content.matchAll(new RegExp(`(${NUMBER})\\s+Tc\\b`, "g"))].map((match) => Number(match[1]));
  const tw = [...content.matchAll(new RegExp(`(${NUMBER})\\s+Tw\\b`, "g"))].map((match) => Number(match[1]));
  const tj: number[] = [];
  for (const match of content.matchAll(/\[([\s\S]*?)\]\s*TJ\b/g)) {
    const array = stripStrings(match[1]!);
    for (const value of array.matchAll(new RegExp(NUMBER, "g"))) tj.push(Number(value[0]));
  }
  return {tc, tw, tj};
}

function decodeContents(contents: unknown): string {
  if (contents instanceof PDFArray) {
    let text = "";
    for (let index = 0; index < contents.size(); index++) {
      const stream = contents.lookup(index, PDFRawStream);
      if (stream) text += new TextDecoder().decode(decodePDFRawStream(stream).decode());
    }
    return text;
  }
  if (contents instanceof PDFRawStream) {
    return new TextDecoder().decode(decodePDFRawStream(contents).decode());
  }
  return "";
}

export async function extractSpacingPriors(pdfPath: string): Promise<SpacingPriorsReport> {
  const document = await PDFDocument.load(readFileSync(pdfPath));
  const pages: PageSpacingPriors[] = [];
  const overall: SpacingOperators = {tc: [], tw: [], tj: []};
  for (const [index, page] of document.getPages().entries()) {
    const operators = parseSpacingOperators(decodeContents(page.node.Contents()));
    overall.tc.push(...operators.tc);
    overall.tw.push(...operators.tw);
    overall.tj.push(...operators.tj);
    pages.push({
      page: index + 1,
      ...operators,
      tcSummary: summarize(operators.tc),
      twSummary: summarize(operators.tw),
      tjSummary: summarize(operators.tj),
    });
  }
  return {
    source: pdfPath,
    pages,
    overall: {
      tc: summarize(overall.tc),
      tw: summarize(overall.tw),
      tj: summarize(overall.tj),
    },
  };
}
