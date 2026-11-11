import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inspectInPage, openInPage, extractText } from "./index.js";
import { decodeLegacy } from "./legacy-decode.js";
import { lookupChar } from "./charmap.js";
import { walkRecords, detectRecordFraming, findTextRegions } from "./records.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "../../../fixtures/inp");
const referencesDir = join(here, "../../../tests");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, name)));
}

describe("charmap", () => {
  it("maps Urdu letters", () => {
    expect(lookupChar(0x81, "urdu")).toBe("\u0627"); // ا
    expect(lookupChar(0x9c, "urdu")).toBe("\u06A9"); // ک
    expect(lookupChar(0xa4, "urdu")).toBe("\u06CC"); // ی
  });

  it("applies Arabic-mode overrides", () => {
    expect(lookupChar(0x9c, "arabic")).toBe("\u0643"); // ك
    expect(lookupChar(0x81, "arabic")).toBe("\u0665"); // ٥
  });

  it("resolves composite before single", () => {
    // 04 81 04 BF → أ (not ا + hamza)
    const data = new Uint8Array([0x04, 0x81, 0x04, 0xbf]);
    const result = decodeLegacy(data);
    expect(result.paragraphs[0]!.runs[0]!.text).toBe("\u0623");
  });

  it("aligns legacy codes with Unicode scalars without changing rawCodes", () => {
    const data = Uint8Array.from([4,0x82,0x20,4,0x81,4,0xbf,4,0x20,0x41]);
    const run = decodeLegacy(data).paragraphs[0]!.runs[0]!;
    expect(run.text).toBe("ب أ A");
    expect(run.charCodes).toEqual([0x82,undefined,undefined,undefined,undefined]);
    expect(run.charCodes).toHaveLength([...run.text].length);
    expect(run.rawCodes).toEqual([0x82,0x81,0xbf,0x20]);
  });

  it("keeps one alignment gap per scalar of a multi-scalar composite", () => {
    const run = decodeLegacy(Uint8Array.from([4,0xa4,4,0xbf])).paragraphs[0]!.runs[0]!;
    expect(run.text).toBe("یئ");
    expect(run.charCodes).toEqual([undefined,undefined]);
  });

  it("keeps direct ASCII runs as literal text", () => {
    // "City" stored as raw bytes between tabs.
    const data = new Uint8Array([
      0x09, 0x43, 0x69, 0x74, 0x79, 0x09, 0x0d,
    ]);
    const result = decodeLegacy(data);
    expect(result.paragraphs[0]!.runs[0]!.text).toBe("\tCity\t");
  });

  it("interleaves ASCII with 04-prefixed Urdu text", () => {
    // 04 81 (ا) then "City" then 04 81 (ا).
    const data = new Uint8Array([
      0x04, 0x81, 0x09, 0x43, 0x69, 0x74, 0x79, 0x09, 0x04, 0x81, 0x0d,
    ]);
    const result = decodeLegacy(data);
    expect(result.paragraphs[0]!.runs[0]!.text).toBe("\u0627\tCity\t\u0627");
  });

  it("does not treat the 04 prefix byte as ASCII", () => {
    const data = new Uint8Array([0x04, 0x81, 0x0d]);
    const result = decodeLegacy(data);
    expect(result.paragraphs[0]!.runs[0]!.text).toBe("\u0627");
  });
});

describe("records", () => {
  it("walks 0D <u32 LE length> records", () => {
    // 0D 03 00 00 00 04 81 0D 0D 03 00 00 00 43 61 0D
    // Record 1: len=3, payload [04 81 0D]
    // Record 2: len=3, payload [43 61 0D] ("Ca")
    const data = new Uint8Array([
      0x0d, 0x03, 0x00, 0x00, 0x00, 0x04, 0x81, 0x0d,
      0x0d, 0x03, 0x00, 0x00, 0x00, 0x43, 0x61, 0x0d,
    ]);
    const { records } = walkRecords(data, 0);
    const payloads = records.filter((r) => r.kind === "record");
    expect(payloads).toHaveLength(2);
    expect(payloads[0]!.payload).toEqual(new Uint8Array([0x04, 0x81, 0x0d]));
    expect(payloads[1]!.payload).toEqual(new Uint8Array([0x43, 0x61, 0x0d]));
  });

  it("detects record framing after the delimiter", () => {
    const data = new Uint8Array([
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0d, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x0d, 0x03, 0x00, 0x00, 0x00, 0x04, 0x81, 0x0d,
    ]);
    const start = detectRecordFraming(data);
    expect(start).not.toBeNull();
    expect(data[start!]).toBe(0x0d);
  });

  it("falls back to null when no delimiter exists", () => {
    expect(detectRecordFraming(new Uint8Array([0x01, 0x02, 0x03]))).toBeNull();
  });

  it("finds dense text regions and skips binary preambles", () => {
    // Binary preamble (no 04 bytes), then dense text, then zeros.
    const data = new Uint8Array(4096);
    for (let i = 1024; i < 2048; i += 2) {
      data[i] = 0x04;
      data[i + 1] = 0x81;
    }
    const regions = findTextRegions(data, 0);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.start).toBeGreaterThanOrEqual(512);
    expect(regions[0]!.end).toBeLessThanOrEqual(2560);
  });
});

describe("inp-parser", () => {
  it("preserves Sample 2 stories, positioned frames, and embedded DIBs", () => {
    const doc = openInPage(
      new Uint8Array(readFileSync(join(referencesDir, "SAMPLE2.INP"))),
    );

    expect(doc.stories.length).toBeGreaterThanOrEqual(29);
    expect(doc.pageObjects.length).toBeGreaterThanOrEqual(30);

    const logo = doc.images.find((image) => image.name === "PPictsc541564");
    expect(logo).toMatchObject({ format: "dib", width: 192, height: 144 });

    const logoFrame = doc.pageObjects.find(
      (object) => object.kind === "image" && object.imageName === "PPictsc541564",
    );
    expect(logoFrame?.bounds).toEqual({
      xPoints: 311.209,
      yPoints: 36,
      widthPoints: 171,
      heightPoints: 93,
    });

    expect(
      doc.pageObjects.some(
        (object) => object.kind === "text" && object.columnCount === 3,
      ),
    ).toBe(true);
  });

  it("detects InPage v1 for Final-1.inp", () => {
    const report = inspectInPage(load("Final-1.inp"));
    expect(report.version).toBe(1);
    expect(report.streams.map((s) => s.name)).toContain("InPage100");
  });

  it("opens Final-1.inp and extracts text", () => {
    const doc = openInPage(load("Final-1.inp"));
    expect(doc.version).toBe(1);
    expect(doc.paragraphs.length).toBeGreaterThan(0);
    expect(doc.fonts.length).toBeGreaterThan(0);
    const text = extractText(doc);
    expect(text.raw.length).toBeGreaterThan(0);
  });

  it("opens Final-2.inp and extracts text", () => {
    const doc = openInPage(load("Final-2.inp"));
    expect(doc.version).toBe(1);
    expect(doc.paragraphs.length).toBeGreaterThan(0);
  });

  it("rejects non-InPage files", () => {
    const junk = new Uint8Array(1024).fill(0x41);
    expect(() => inspectInPage(junk)).toThrow();
  });
});
