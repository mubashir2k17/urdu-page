// Vector-level fidelity gate. Excluded from the fast suite by default; run with:
//   npm run test:vector
// It compares per-outline bounding boxes between the reference and generated
// PDFs, which surfaces per-glyph advance/offset drift the 36-dpi raster score
// cannot see.

import { describe, expect, it } from "vitest";

import { vectorDiffCase } from "../tools/vector-diff.js";

const enabled = process.env.VECTOR_FIDELITY === "1";
const target = Number(process.env.VECTOR_TARGET ?? "0.97");

describe.runIf(enabled)("vector fidelity", () => {
  it(
    `A3 sample matches ${(target * 100).toFixed(0)}% of reference outlines`,
    async () => {
      const result = await vectorDiffCase("A3 sample", { inpageFonts: "fonts/inpage-local" });
      for (const page of result.pages) {
        console.log(
          `page ${page.page}: ${(page.matchRate * 100).toFixed(2)}% ` +
            `(centre Δ ${page.meanCenterDelta.toFixed(2)}pt) -> ${page.referenceSvg}`,
        );
      }
      expect(result.averageMatchRate).toBeGreaterThanOrEqual(target);
    },
    600_000,
  );
});
