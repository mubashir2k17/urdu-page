import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

import { extractText, openInPage, renderPdf } from "@inpage/converter";
import { NodeFallbackFont } from "@inpage/pdf-renderer";
import type { FallbackFont } from "@inpage/pdf-renderer";
import type { InPageVersion } from "@inpage/document-model";

import type { ReferenceCase } from "./reference-manifest.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultFallbackFont = new NodeFallbackFont(async () =>
  new Uint8Array(readFileSync(join(projectRoot, "fonts/NotoNastaliqUrdu-Regular.ttf"))),
);

export interface PdfSummary {
  pageCount: number;
  firstPage: {
    widthPoints: number;
    heightPoints: number;
  };
}

export interface ReferenceAuditResult {
  name: string;
  version: InPageVersion;
  extractedCharacters: number;
  diagnosticCount: number;
  reference: PdfSummary;
  generated: PdfSummary;
  comparisons: {
    pageCountMatches: boolean;
    firstPageSizeMatches: boolean;
  };
}

export interface CurrentConversion {
  version: InPageVersion;
  extractedCharacters: number;
  diagnosticCount: number;
  bytes: Uint8Array;
}

export async function auditReferenceCase(
  referenceCase: ReferenceCase,
  current?: CurrentConversion,
): Promise<ReferenceAuditResult> {
  const conversion = current ?? (await renderCurrentPdf(referenceCase));
  const reference = await summarizePdf(readFileSync(referenceCase.referencePdf));
  const generated = await summarizePdf(conversion.bytes);

  return {
    name: referenceCase.name,
    version: conversion.version,
    extractedCharacters: conversion.extractedCharacters,
    diagnosticCount: conversion.diagnosticCount,
    reference,
    generated,
    comparisons: {
      pageCountMatches: generated.pageCount === reference.pageCount,
      firstPageSizeMatches:
        approximatelyEqual(generated.firstPage.widthPoints, reference.firstPage.widthPoints) &&
        approximatelyEqual(generated.firstPage.heightPoints, reference.firstPage.heightPoints),
    },
  };
}

export async function renderCurrentPdf(
  referenceCase: ReferenceCase,
  fallbackFont: FallbackFont = defaultFallbackFont,
): Promise<CurrentConversion> {
  const input = new Uint8Array(readFileSync(referenceCase.input));
  const document = await openInPage(input, { strict: false });
  const extracted = extractText(document);
  const bytes = await renderPdf(
    document,
    {
      preservePageSize: true,
      embedFonts: true,
      searchableText: true,
      ...(referenceCase.preserveLayout ? { preserveLayout: true } : {}),
      ...(referenceCase.preserveLayout
        ? {
            outputPageSize: {
              widthPoints: referenceCase.expected.widthPoints,
              heightPoints: referenceCase.expected.heightPoints,
            },
          }
        : {}),
    },
    fallbackFont,
  );

  return {
    version: document.version,
    extractedCharacters: extracted.raw.length,
    diagnosticCount: document.diagnostics.length,
    bytes,
  };
}

async function summarizePdf(bytes: Uint8Array): Promise<PdfSummary> {
  const pdf = await PDFDocument.load(bytes);
  const firstPage = pdf.getPage(0);
  const { width, height } = firstPage.getSize();
  return {
    pageCount: pdf.getPageCount(),
    firstPage: { widthPoints: width, heightPoints: height },
  };
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1;
}
