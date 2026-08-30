import { describe, it, expect } from "vitest";
import { createDiagnosticCollector } from "./index.js";

describe("diagnostics", () => {
  it("collects diagnostics with categories", () => {
    const c = createDiagnosticCollector();
    c.warn("encoding", "INP_AMBIGUOUS", "ambiguous byte", { offset: 42 });
    c.error("parsing", "INP_BOUNDS", "out of bounds");
    expect(c.diagnostics.length).toBe(2);
    expect(c.diagnostics[0]!.category).toBe("encoding");
    expect(c.diagnostics[0]!.offset).toBe(42);
    expect(c.hasErrors()).toBe(true);
  });

  it("reports no errors when none recorded", () => {
    const c = createDiagnosticCollector();
    c.info("parsing", "X", "ok");
    expect(c.hasErrors()).toBe(false);
  });
});
