import { describe, expect, it } from "vitest";

import { resolveSpacingCalibration } from "../packages/pdf-renderer/src/spacing-calibration.js";
import {
  buildSpacingProbeCorpus,
  fitCalibrationFromOracle,
  fitSpacingCalibration,
} from "../tools/spacing-calibration.js";
import { toRendererSpacingPriors } from "../tools/spacing-priors.js";

function summary(count: number, median: number) {
  return {count, mean: median, median, p95Abs: 0};
}

describe("spacing calibration", () => {
  it("fits per-kind scale factors as the median of probe samples", () => {
    const report = fitSpacingCalibration([{
      fontId: "font-a",
      samples: [
        {kind: "space", naturalAdvance: 10, measuredAdvance: 10.3},
        {kind: "space", naturalAdvance: 40, measuredAdvance: 41.2},
        {kind: "tracking", naturalAdvance: 4, measuredAdvance: 53.8, baselineMeasuredAdvance: 50, gaps: 4, trackingPoints: 1},
        {kind: "tracking", naturalAdvance: 4, measuredAdvance: 54.0, baselineMeasuredAdvance: 50, gaps: 4, trackingPoints: 1},
        {kind: "kashida", naturalAdvance: 6, measuredAdvance: 36, baselineMeasuredAdvance: 30, count: 3, unitAdvance: 2},
      ],
    }]);
    expect(report.fonts?.["font-a"]?.spaceScale).toBeCloseTo(1.03, 6);
    expect(report.fonts?.["font-a"]?.trackingScale).toBeCloseTo(0.975, 6);
    expect(report.fonts?.["font-a"]?.kashidaUnit).toBeCloseTo(1, 6);
    expect(report.default?.spaceScale).toBeCloseTo(1.03, 6);
  });

  it("emits identity-compatible output when a probe is unusable", () => {
    const report = fitSpacingCalibration([{
      fontId: "font-a",
      samples: [{kind: "kashida", naturalAdvance: 30, measuredAdvance: 36, count: 0}],
    }]);
    expect(report.fonts?.["font-a"]).toBeUndefined();
    expect(report.evidence).toEqual([]);
  });

  it("fits from oracle samples by summing measured advances", () => {
    const report = fitCalibrationFromOracle([
      {
        name: "spaces-2",
        advances: [5.1, 5.1],
        probe: {kind: "space", fontId: "font-a", count: 2, naturalAdvance: 10},
      },
    ]);
    expect(report.fonts?.["font-a"]?.spaceScale).toBeCloseTo(1.02, 6);
    expect(report.evidence[0]).toMatchObject({fontId: "font-a", kind: "space", samples: 1});
  });

  it("pairs perturbation samples with a same-marker baseline", () => {
    const report = fitCalibrationFromOracle([
      {
        name: "baseline",
        advances: [10],
        probe: {kind: "baseline", fontId: "font-a", groupId: "spaces", dpi: 72},
      },
      {
        name: "spaces-1",
        advances: [15],
        probe: {kind: "space", fontId: "font-a", groupId: "spaces", dpi: 72, naturalAdvance: 5},
      },
    ]);
    expect(report.fonts?.["font-a"]?.spaceScale).toBeCloseTo(1, 6);
  });

  it("converts raster pixels to points with the probe DPI", () => {
    const report = fitCalibrationFromOracle([
      {
        name: "spaces-1",
        advances: [20],
        probe: {kind: "space", fontId: "font-a", dpi: 144, naturalAdvance: 10},
      },
    ]);
    expect(report.fonts?.["font-a"]?.spaceScale).toBeCloseTo(1, 6);
  });

  it("rejects oracle files without probe metadata", () => {
    expect(() => fitCalibrationFromOracle([{name: "plain", advances: [5]}])).toThrow(/probe metadata/);
  });

  it("builds one probe per variable per font", () => {
    const corpus = buildSpacingProbeCorpus(["font-a"]);
    const kinds = corpus.probes.map((probe) => probe.kind);
    expect(kinds.filter((kind) => kind === "space")).toHaveLength(3);
    expect(kinds.filter((kind) => kind === "tracking")).toHaveLength(3);
    expect(kinds.filter((kind) => kind === "kashida")).toHaveLength(3);
    expect(kinds).toContain("mixed");
  });

  it("maps extracted Tc/Tw medians to renderer priors", () => {
    expect(toRendererSpacingPriors({
      overall: {tc: summary(2, 0.5), tw: summary(1, 1.5), tj: summary(0, 0)},
    })).toEqual({characterSpacing: 0.5, wordSpacing: 1.5});
    expect(toRendererSpacingPriors({
      overall: {tc: summary(0, 0), tw: summary(0, 0), tj: summary(9, -0.8)},
    })).toEqual({});
  });

  it("resolves per-font entries with per-field fallback and identity defaults", () => {
    const calibration = {
      default: {spaceScale: 1.1, kashidaUnit: 0.9},
      fonts: {"font-a": {trackingScale: 0.5, spaceScale: 1.2}},
    };
    const a = resolveSpacingCalibration(calibration, "font-a");
    expect(a).toEqual({spaceScale: 1.2, trackingScale: 0.5, kashidaUnit: 0.9});
    const b = resolveSpacingCalibration(calibration, "font-b");
    expect(b).toEqual({spaceScale: 1.1, trackingScale: 1, kashidaUnit: 0.9});
    expect(resolveSpacingCalibration(undefined, "font-a")).toEqual({spaceScale: 1, trackingScale: 1, kashidaUnit: 1});
    expect(resolveSpacingCalibration({fonts: {"font-a": {spaceScale: 0}}}, "font-a").spaceScale).toBe(1);
  });
});
