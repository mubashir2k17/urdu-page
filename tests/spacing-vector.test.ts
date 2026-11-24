// Spacing fidelity gate. Excluded from the fast suite; run with:
//   npm run test:spacing
//
// Hard gate after two consecutive green baseline runs (ADR-020). Set
// SPACING_ADVISORY=1 to report without failing.

import { describe, expect, it } from "vitest";

import { spacingDiffCase } from "../tools/spacing-diff.js";

const enabled = process.env.SPACING_FIDELITY === "1";
const enforce = process.env.SPACING_ADVISORY !== "1";
const maxP95Dx = Number(process.env.SPACING_P95_DX ?? "1.0");
const maxBias = Number(process.env.SPACING_BIAS ?? "0.3");
const maxP95Dgap = Number(process.env.SPACING_P95_DGAP ?? "0.5");

describe.runIf(enabled)("spacing fidelity", () => {
  it(
    "keeps per-glyph drift and word-gap error within the ADR-020 thresholds",
    async () => {
      const result = await spacingDiffCase("A3 sample", {inpageFonts: "fonts/inpage-local"});
      for (const page of result.pages) {
        console.log(
          `page ${page.page}: p95 |dx| ${page.metrics.p95AbsDx.toFixed(3)} pt, ` +
            `bias ${page.metrics.meanDx.toFixed(3)} pt, ` +
            `p95 |dgap| ${page.metrics.p95AbsDgap.toFixed(3)} pt, ` +
            `gap EMD ${page.histogram.earthMover.toFixed(3)} pt -> ${page.lagPlotPng}`,
        );
      }
      const p95 = Math.max(...result.pages.map((page) => page.metrics.p95AbsDx));
      const bias = Math.max(...result.pages.map((page) => Math.abs(page.metrics.meanDx)));
      const dgap = Math.max(...result.pages.map((page) => page.metrics.p95AbsDgap));
      console.log(
        `gate (${enforce ? "hard" : "advisory"}): p95 |dx| ${p95.toFixed(3)}/${maxP95Dx}, ` +
          `|bias| ${bias.toFixed(3)}/${maxBias}, p95 |dgap| ${dgap.toFixed(3)}/${maxP95Dgap}`,
      );
      if (enforce) {
        expect(p95).toBeLessThanOrEqual(maxP95Dx);
        expect(bias).toBeLessThanOrEqual(maxBias);
        expect(dgap).toBeLessThanOrEqual(maxP95Dgap);
      }
    },
    900_000,
  );
});
