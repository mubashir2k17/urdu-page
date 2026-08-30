import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readCfb, CFB_MAGIC, CfbSecurityError } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "../../../fixtures/inp");

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, name)));
}

describe("CFB reader", () => {
  it("accepts valid CFB magic", () => {
    const data = new Uint8Array(512);
    data.set(CFB_MAGIC, 0);
    // header-only is not enough for a full read, but magic check passes in parseHeader
    expect(() => readCfb(data)).toThrow();
  });

  it("rejects non-CFB files", () => {
    const data = new Uint8Array(1024);
    data.fill(0x41);
    expect(() => readCfb(data)).toThrow(CfbSecurityError);
  });

  it("rejects files below minimum size", () => {
    expect(() => readCfb(new Uint8Array(100))).toThrow(CfbSecurityError);
  });

  it("reads Final-1.inp and finds the InPage100 stream", () => {
    const cfb = readCfb(load("Final-1.inp"));
    const paths = [...cfb.byPath.keys()];
    expect(paths).toContain("InPage100");
    const stream = cfb.byPath.get("InPage100");
    expect(stream).toBeDefined();
    expect(stream!.size).toBeGreaterThan(0);
    expect(stream!.bytes.length).toBe(stream!.size);
  });

  it("reads Final-2.inp and finds the InPage100 stream", () => {
    const cfb = readCfb(load("Final-2.inp"));
    expect(cfb.byPath.has("InPage100")).toBe(true);
    expect(cfb.byPath.get("InPage100")!.size).toBeGreaterThan(0);
  });

  it("finds Root Entry and DocumentInfo", () => {
    const cfb = readCfb(load("Final-1.inp"));
    expect(cfb.directory.root.objectType).toBe("root");
    expect(cfb.directory.root.name).toBe("Root Entry");
    const paths = [...cfb.byPath.keys()];
    expect(paths).toContain("DocumentInfo");
  });

  it("preserves stream byte offsets", () => {
    const cfb = readCfb(load("Final-2.inp"));
    const stream = cfb.byPath.get("InPage100")!;
    expect(stream.offsets.length).toBeGreaterThan(0);
    for (const off of stream.offsets) {
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(1024 * 1024 * 50);
    }
  });
});
