import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { HarfBuzzTextShaper } from "@inpage/text-shaper";
import { PdfLibBackend } from "./pdflib-backend.js";

const bytes = readFileSync(new URL("../../../fonts/NotoNastaliqUrdu-Regular.ttf", import.meta.url));

describe("rotated glyph placement", () => {
  for (const angle of [90, -90, 12]) {
    it(`rotates the entire shaped run by ${angle} degrees around its origin`, async () => {
      const run = new HarfBuzzTextShaper().shape({text: "Test اِ", direction: "ltr", script: "arab",
        language: "ur", font: {id: "embedded-fallback", bytes}});
      const matrices: number[][][] = [];
      for (const rotation of [0, angle]) {
        const backend = await PdfLibBackend.create();
        await backend.setFont(bytes);
        backend.addPage(300, 300);
        backend.drawShapedRun(run, 50, 60, 12, rotation);
        const pdf = await PDFDocument.load(await backend.save());
        const contents = pdf.getPage(0).node.Contents();
        if (!(contents instanceof PDFArray)) throw new Error("Missing content stream");
        const text = new TextDecoder().decode(decodePDFRawStream(contents.lookup(0, PDFRawStream)).decode());
        matrices.push([...text.matchAll(/([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) Tm/g)]
          .map(match => match.slice(1).map(Number)));
      }
      expect(matrices[0]!.length).toBeGreaterThan(4);
      const radians = angle * Math.PI / 180;
      for (const [index, matrix] of matrices[1]!.entries()) {
        const original = matrices[0]![index]!;
        const dx = original[4]! - 50;
        const dy = original[5]! - 60;
        expect(matrix[4]).toBeCloseTo(50 + dx * Math.cos(radians) - dy * Math.sin(radians), 6);
        expect(matrix[5]).toBeCloseTo(60 + dx * Math.sin(radians) + dy * Math.cos(radians), 6);
      }
    });
  }
});
