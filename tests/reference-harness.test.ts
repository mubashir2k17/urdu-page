import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractText, inspectInPage, openInPage } from "@inpage/converter";

import { REFERENCE_CASES } from "./reference-manifest.js";
import { auditReferenceCase, renderCurrentPdf } from "./reference-harness.js";

describe("reference PDF manifest", () => {
  it.each(REFERENCE_CASES)(
    "$name has the verified reference geometry",
    async ({ referencePdf, expected }) => {
      const pdf = await PDFDocument.load(readFileSync(referencePdf));
      const firstPage = pdf.getPage(0);
      const { width, height } = firstPage.getSize();

      expect(pdf.getPageCount()).toBe(expected.pageCount);
      expect(width).toBeCloseTo(expected.widthPoints, 1);
      expect(height).toBeCloseTo(expected.heightPoints, 1);
    },
  );
});

describe("reference conversion audit", () => {
  it("accepts an injected font for controlled fallback comparisons", async () => {
    const sample = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "A3 sample")!;
    const sentinel = new Error("injected fallback reached");

    await expect(
      renderCurrentPdf(sample, {
        async getBytes() {
          throw sentinel;
        },
      }),
    ).rejects.toBe(sentinel);
  });

  it.each(REFERENCE_CASES)("converts $name through the public API", async (referenceCase) => {
    const result = await auditReferenceCase(referenceCase);

    expect(result.version).toBe(1);
    expect(result.extractedCharacters).toBeGreaterThan(0);
    expect(result.generated.pageCount).toBeGreaterThan(0);
    expect(result.reference.pageCount).toBe(referenceCase.expected.pageCount);
  });

  it("preserves mixed English text from the A3 sample", async () => {
    const sample = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "A3 sample")!;
    const document = await openInPage(new Uint8Array(readFileSync(sample.input)), { strict: false });

    const raw = extractText(document).raw;
    expect(raw).toContain("City");
    expect(raw).toContain("Sharjah");
    expect(raw).toContain("Karachi");
    expect(raw).toContain("Max.");
    expect(raw).toContain("Min.");
  });

  it("preserves the A4 font-catalogue page size in the document model", async () => {
    const sample = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "font catalogue")!;
    const document = await openInPage(new Uint8Array(readFileSync(sample.input)), { strict: false });

    expect(document.pageSetup?.widthPoints).toBeCloseTo(sample.expected.widthPoints, 1);
    expect(document.pageSetup?.heightPoints).toBeCloseTo(sample.expected.heightPoints, 1);
  });

  it("preserves the font-catalogue page margins in the document model", async () => {
    const fonts = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "font catalogue")!;
    const document = await openInPage(new Uint8Array(readFileSync(fonts.input)), { strict: false });

    expect(document.pageSetup?.margins.leftPoints).toBeCloseTo(36, 3);
    expect(document.pageSetup?.margins.topPoints).toBeCloseTo(36, 3);
    expect(document.pageSetup?.margins.rightPoints).toBeCloseTo(36, 3);
    expect(document.pageSetup?.margins.bottomPoints).toBeCloseTo(36, 3);
  });

  it("preserves the Letter book page size in the document model", async () => {
    const book = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "book body")!;
    const document = await openInPage(new Uint8Array(readFileSync(book.input)), { strict: false });

    expect(document.pageSetup?.widthPoints).toBeCloseTo(book.expected.widthPoints, 1);
    expect(document.pageSetup?.heightPoints).toBeCloseTo(book.expected.heightPoints, 1);
    expect(document.pageSetup?.margins).toEqual({
      leftPoints: 162,
      topPoints: 54,
      rightPoints: 162,
      bottomPoints: 216,
    });
  });

  it("uses the A4 source geometry for the sample printed on A3 media", async () => {
    const sample = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "A3 sample")!;
    const a4 = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "font catalogue")!;
    const document = await openInPage(new Uint8Array(readFileSync(sample.input)), { strict: false });

    expect(document.pageSetup?.widthPoints).toBeCloseTo(a4.expected.widthPoints, 1);
    expect(document.pageSetup?.heightPoints).toBeCloseTo(a4.expected.heightPoints, 1);
  });

  it("renders the Letter book using its preserved source page size", async () => {
    const book = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "book body")!;
    const result = await auditReferenceCase(book);

    expect(result.generated.firstPage.widthPoints).toBeCloseTo(book.expected.widthPoints, 1);
    expect(result.generated.firstPage.heightPoints).toBeCloseTo(book.expected.heightPoints, 1);
  });

  it("reports source page geometry through inspection", async () => {
    const fonts = REFERENCE_CASES.find((referenceCase) => referenceCase.name === "font catalogue")!;
    const report = await inspectInPage(new Uint8Array(readFileSync(fonts.input)));

    expect(report.pageSetup?.widthPoints).toBeCloseTo(fonts.expected.widthPoints, 1);
    expect(report.pageSetup?.heightPoints).toBeCloseTo(fonts.expected.heightPoints, 1);
  });
});
