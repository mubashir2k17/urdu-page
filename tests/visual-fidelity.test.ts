// Visual fidelity gate. Excluded from the fast suite by default; run with:
//   npm run test:visual
// It asserts the SAMPLE2 ink-overlap target against the reference PDF and
// writes red/blue comparison PNGs under tmp/pdfs/visual-diff/.

import { describe, expect, it } from "vitest";

import { diffCase } from "../tools/visual-diff.js";

const enabled = process.env.VISUAL_FIDELITY === "1";
const target = Number(process.env.VISUAL_TARGET ?? "0.9");

describe.runIf(enabled)("visual fidelity", () => {
  it(
    `A3 sample reaches ${(target * 100).toFixed(0)}% ink overlap with imported fonts`,
    async () => {
      const result = await diffCase("A3 sample", { inpageFonts: "fonts/inpage-local" });
      for (const page of result.pages) {
        console.log(`page ${page.page}: ${(page.overlap * 100).toFixed(2)}% -> ${page.comparisonPng}`);
      }
      expect(result.average).toBeGreaterThanOrEqual(target);
    },
    600_000,
  );
});
