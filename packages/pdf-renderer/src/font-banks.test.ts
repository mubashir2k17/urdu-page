import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFName, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { HarfBuzzTextShaper } from "@inpage/text-shaper";
import { openInPage } from "@inpage/inp-parser";
import { PdfLibBackend, renderPdf } from "./index.js";

const bytes = readFileSync(new URL("../../../fonts/NotoNastaliqUrdu-Regular.ttf", import.meta.url));
const shaper = new HarfBuzzTextShaper();
const run = shaper.shape({ text: "ایک متن", direction: "rtl", script: "arab", language: "ur",
  font: { id: "embedded-fallback", bytes } });

describe("PDF font banks", () => {
  it("switches font resources and returns to fallback on each page", async () => {
    const backend = await PdfLibBackend.create();
    await backend.setFont(bytes);
    await backend.registerFont(bytes, "bank");
    const mixed = { ...run, glyphs: run.glyphs.map((glyph, index) =>
      index === 1 ? { ...glyph, fontId: "bank" } : glyph) };
    for (let i = 0; i < 2; i++) {
      backend.addPage(300, 300);
      backend.drawShapedRun(mixed, 30, 100, 12);
    }
    const pdf = await PDFDocument.load(await backend.save());
    for (const page of pdf.getPages()) {
      expect(page.node.Resources()!.lookup(PDFName.of("Font"), PDFDict).keys()).toHaveLength(2);
      const contents = page.node.Contents();
      if (!(contents instanceof PDFArray)) throw new Error("Expected content streams");
      const operators = new TextDecoder().decode(decodePDFRawStream(contents.lookup(0, PDFRawStream)).decode());
      const switches = [...operators.matchAll(/\/(\S+) 12 Tf/g)].map((match) => match[1]);
      expect(switches).toHaveLength(3);
      expect(switches[0]).toBe(switches[2]);
      expect(switches[0]).not.toBe(switches[1]);
      expect(operators).toContain("/ActualText <FEFF");
    }
  });

  it("rejects unknown or duplicate font identities", async () => {
    const backend = await PdfLibBackend.create();
    await backend.setFont(bytes);
    await expect(backend.registerFont(bytes, "embedded-fallback")).rejects.toThrow("Duplicate");
    backend.addPage(300, 300);
    expect(() => backend.drawShapedRun({ ...run,
      glyphs: [{ ...run.glyphs[0]!, fontId: "missing" }] }, 0, 0, 12)).toThrow("unregistered");
  });

  it("accepts a shaper and bank bytes through the public render API", async () => {
    const doc = openInPage(readFileSync(new URL("../../../tests/SAMPLE2.INP", import.meta.url)));
    doc.pages = [];
    doc.paragraphs = [{ ...doc.paragraphs[0]!, runs: [{ ...doc.paragraphs[0]!.runs[0]!, text: "ایک متن" }] }];
    const result = await renderPdf(doc, { preservePageSize: true, embedFonts: true, searchableText: true },
      { async getBytes() { return bytes; } }, {
        fonts: [{ id: "bank", bytes }],
        shaper: { shape(input) {
          const shaped = shaper.shape(input);
          return { ...shaped, glyphs: shaped.glyphs.map((glyph) => ({ ...glyph, fontId: "bank" })) };
        } },
      });
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict).keys()).toHaveLength(2);
  });
});
