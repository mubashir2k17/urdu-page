import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { registerFontProvider, renderPdf, NodeFallbackFont } from "./index.js";
import { openInPage } from "@inpage/inp-parser";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "../../../fixtures/inp");
const referencesDir = join(here, "../../../tests");
const fontsDir = join(here, "../../../fonts");

const font = new NodeFallbackFont(async () => {
  return new Uint8Array(readFileSync(join(fontsDir, "NotoNastaliqUrdu-Regular.ttf")));
});

describe("pdf-renderer", () => {
  it("renders a searchable PDF from Final-1.inp", async () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "Final-1.inp")));
    const doc = openInPage(data);
    const result = await renderPdf(doc, { preservePageSize: true, embedFonts: true, searchableText: true }, font);

    expect(result.bytes.length).toBeGreaterThan(1000);

    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    expect(Math.round(width)).toBe(612);
    expect(Math.round(height)).toBe(792);
  });

  it("starts text at the source top margin", async () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "Final-1.inp")));
    const doc = openInPage(data);
    const result = await renderPdf(doc, { preservePageSize: true, embedFonts: true, searchableText: true }, font);
    const pdf = await PDFDocument.load(result.bytes);

    expect(firstTextPosition(pdf).y).toBeCloseTo(738, 3);
  });

  it("starts A4 font-catalogue text at its 36-point top margin", async () => {
    const data = new Uint8Array(readFileSync(join(referencesDir, "FONTS.INP")));
    const doc = openInPage(data);
    const result = await renderPdf(doc, { preservePageSize: true, embedFonts: true, searchableText: true }, font);
    const pdf = await PDFDocument.load(result.bytes);

    expect(firstTextPosition(pdf).y).toBeCloseTo(805.8895, 3);
  });

  it("right-aligns text using the embedded font metrics", async () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "Final-1.inp")));
    const doc = openInPage(data);
    const result = await renderPdf(doc, { preservePageSize: true, embedFonts: true, searchableText: true }, font);
    const pdf = await PDFDocument.load(result.bytes);

    expect(firstTextPosition(pdf).x).toBeCloseTo(387.2515, 3);
  });

  it("emits positioned HarfBuzz glyphs with logical ActualText", async () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "Final-1.inp")));
    const doc = openInPage(data);
    const result = await renderPdf(
      doc,
      { preservePageSize: true, embedFonts: true, searchableText: true },
      font,
    );
    const pdf = await PDFDocument.load(result.bytes);
    const operators = pageOperators(pdf, 0);

    expect(operators).toContain("/Span << /ActualText <FEFF");
    expect(operators).toContain("BDC");
    expect(operators).toContain("EMC");
    expect(operators.match(/<[0-9a-f]{4}> Tj/g)?.length).toBeGreaterThan(1);
  });

  it("reports the number of PDF pages emitted after text overflow", async () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "Final-1.inp")));
    const doc = openInPage(data);
    const result = await renderPdf(doc, { preservePageSize: true, embedFonts: true, searchableText: true }, font);
    const pdf = await PDFDocument.load(result.bytes);

    expect(result.pageCount).toBe(pdf.getPageCount());
  });

  it("uses a registered provider match when no fallback font is passed", async () => {
    const data = new Uint8Array(readFileSync(join(fixturesDir, "Final-1.inp")));
    const doc = openInPage(data);
    const resolvedNames: string[][] = [];
    const fontBytes = new Uint8Array(
      readFileSync(join(fontsDir, "NotoNastaliqUrdu-Regular.ttf")),
    );
    const unregister = registerFontProvider({
      async resolve(inPageFontNames) {
        resolvedNames.push(inPageFontNames);
        return new Map([["Noori Nastaliq", fontBytes]]);
      },
      async getFallback() {
        throw new Error("exact document font should take precedence");
      },
    });

    try {
      const result = await renderPdf(doc, {
        preservePageSize: true,
        embedFonts: true,
        searchableText: true,
      });
      expect(result.bytes.length).toBeGreaterThan(1000);
      expect(resolvedNames).toEqual([doc.fonts.map(({ name }) => name)]);
    } finally {
      unregister();
    }
  });
});

function firstTextPosition(pdf: PDFDocument): { x: number; y: number } {
  const operators = pageOperators(pdf, 0);
  const match = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/.exec(operators);
  if (!match) throw new Error("Generated PDF contains no text matrix");
  return { x: Number(match[1]), y: Number(match[2]) };
}

function pageOperators(pdf: PDFDocument, pageIndex: number): string {
  const contents = pdf.getPage(pageIndex).node.Contents();
  const streams =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) => contents.lookup(index, PDFRawStream))
      : contents instanceof PDFRawStream
        ? [contents]
        : [];
  return streams
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join("\n");
}
