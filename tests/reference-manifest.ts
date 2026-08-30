import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));

export interface ReferenceExpectation {
  pageCount: number;
  widthPoints: number;
  heightPoints: number;
}

export interface ReferenceCase {
  name: string;
  input: string;
  referencePdf: string;
  expected: ReferenceExpectation;
  /** One-based pages used by the slower raster comparison. */
  samplePages: readonly number[];
}

function referenceCase(
  name: string,
  inputName: string,
  pdfName: string,
  expected: ReferenceExpectation,
  samplePages: readonly number[],
): ReferenceCase {
  return {
    name,
    input: join(testsDirectory, inputName),
    referencePdf: join(testsDirectory, pdfName),
    expected,
    samplePages,
  };
}

export const REFERENCE_CASES: readonly ReferenceCase[] = [
  referenceCase(
    "font catalogue",
    "FONTS.INP",
    "FONTS.pdf",
    { pageCount: 2, widthPoints: 595.32, heightPoints: 841.92 },
    [1, 2],
  ),
  referenceCase(
    "A3 sample",
    "SAMPLE2.INP",
    "SAMPLE2.pdf",
    { pageCount: 1, widthPoints: 841.92, heightPoints: 1190.52 },
    [1],
  ),
  referenceCase(
    "book body",
    "book part1.inp",
    "book part1.pdf",
    { pageCount: 241, widthPoints: 612, heightPoints: 792 },
    [1, 120, 241],
  ),
  referenceCase(
    "book table of contents",
    "book table of contents.inp",
    "book table of contents.pdf",
    { pageCount: 12, widthPoints: 612, heightPoints: 792 },
    [1, 6, 12],
  ),
];
