// Fit per-font spacing corrections from native-oracle probes (ADR-020 item 7).
//
// Probes isolate one variable each: N spaces, a tracking sweep, a kashida
// sweep, and a mixed-font line. The fitted JSON sits beside nooric-tables.json
// and is loaded by loadInPageTypography; absent or identity calibration cannot
// change rendering.

import type { FontSpacingCalibration, SpacingCalibration } from "@inpage/pdf-renderer";

export type SpacingProbeKind = "baseline" | "space" | "tracking" | "kashida" | "mixed";
/** `advance` = pen span between the first/last ink starts; `width` = ink span. */
export type SpacingMetric = "advance" | "width";

export interface SpacingProbeMeasurement {
  kind: SpacingProbeKind;
  /** Natural size of the perturbation, in points (N spaces, gaps×tracking, or N×unit). */
  naturalAdvance: number;
  /** Perturbed measurement from the oracle raster, in points. */
  measuredAdvance: number;
  /** Same-marker baseline measurement, in points, when the probe has one. */
  baselineMeasuredAdvance?: number;
  metric?: SpacingMetric;
  count?: number;
  gaps?: number;
  trackingPoints?: number;
  unitAdvance?: number;
}

export interface FontSpacingSamples {
  fontId: string;
  samples: SpacingProbeMeasurement[];
}

export interface SpacingCalibrationEvidence {
  fontId: string;
  kind: SpacingProbeKind;
  samples: number;
  scale: number;
}

export interface SpacingCalibrationReport extends SpacingCalibration {
  version: 1;
  evidence: SpacingCalibrationEvidence[];
}

export interface OracleSpacingProbe {
  kind: SpacingProbeKind;
  fontId: string;
  /** Groups perturbation samples with their same-marker baseline. */
  groupId?: string;
  /** Raster resolution used for this probe; advances are converted to points. */
  dpi?: number;
  metric?: SpacingMetric;
  count?: number;
  gaps?: number;
  trackingPoints?: number;
  unitAdvance?: number;
  naturalAdvance?: number;
  /** Human instructions carried through the manifest. */
  text?: string;
  note?: string;
  fontSize?: number;
  fontName?: string;
}

export interface OracleSpacingSample {
  name?: string;
  advances?: readonly number[];
  widths?: readonly number[];
  probe?: OracleSpacingProbe;
}

export interface SpacingProbeDescriptor {
  name: string;
  kind: SpacingProbeKind;
  fontId: string;
  groupId: string;
  text: string;
  expectedGlyphs: number;
  metric?: SpacingMetric;
  count?: number;
  gaps?: number;
  trackingPoints?: number;
  unitAdvance?: number;
  note: string;
}

export interface SpacingProbeVocabulary {
  direction: "rtl" | "ltr";
  /** Two non-joining markers, e.g. "اا". */
  baselineText: string;
  /** Five non-joining markers for the tracking sweep. */
  trackingText: string;
  /** One marker used around the spaces probe. */
  spaceMarker: string;
  /** A word that accepts native kashida. */
  kashidaText: string;
}

export const ARABIC_PROBE_VOCABULARY: SpacingProbeVocabulary = {
  direction: "rtl",
  baselineText: "اا",
  trackingText: "ااااا",
  spaceMarker: "ا",
  kashidaText: "با",
};

export const LATIN_PROBE_VOCABULARY: SpacingProbeVocabulary = {
  direction: "ltr",
  baselineText: "HH",
  trackingText: "HHHHH",
  spaceMarker: "H",
  kashidaText: "",
};

export interface SpacingProbeCorpus {
  version: 1;
  probes: SpacingProbeDescriptor[];
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]!
    : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function scaleFor(sample: SpacingProbeMeasurement): number | undefined {
  if (sample.kind === "baseline" || sample.kind === "mixed") return undefined;
  const measured = sample.measuredAdvance;
  const natural = sample.naturalAdvance;
  if (!Number.isFinite(measured) || !Number.isFinite(natural)) return undefined;
  const excess = measured - (sample.baselineMeasuredAdvance ?? 0);
  if (sample.kind === "space") {
    // naturalAdvance is the perturbation only (N × natural space advance).
    return natural > 0 ? excess / natural : undefined;
  }
  if (sample.kind === "tracking") {
    const gaps = sample.gaps ?? sample.count;
    const trackingPoints = sample.trackingPoints;
    if (!gaps || gaps <= 0 || !trackingPoints || trackingPoints <= 0) return undefined;
    return excess / (gaps * trackingPoints);
  }
  const count = sample.count;
  const unitAdvance = sample.unitAdvance;
  if (!count || count <= 0 || !unitAdvance || unitAdvance <= 0) return undefined;
  return excess / (count * unitAdvance);
}

function fitKind(samples: readonly SpacingProbeMeasurement[], kind: "space" | "tracking" | "kashida"):
  {scale: number; count: number} | undefined {
  const scales = samples
    .filter((sample) => sample.kind === kind)
    .map(scaleFor)
    .filter((value): value is number => value !== undefined && Number.isFinite(value) &&
      (kind === "space" ? value > 0 : value >= 0));
  if (scales.length === 0) return undefined;
  return {scale: median(scales), count: scales.length};
}

/** Median fit per font and kind; missing kinds stay absent (identity on resolve). */
export function fitSpacingCalibration(fonts: readonly FontSpacingSamples[]): SpacingCalibrationReport {
  const fitted: Record<string, FontSpacingCalibration> = {};
  const evidence: SpacingCalibrationEvidence[] = [];
  for (const font of fonts) {
    const entry: FontSpacingCalibration = {};
    const space = fitKind(font.samples, "space");
    const tracking = fitKind(font.samples, "tracking");
    const kashida = fitKind(font.samples, "kashida");
    if (space) { entry.spaceScale = space.scale; evidence.push({fontId: font.fontId, kind: "space", samples: space.count, scale: space.scale}); }
    if (tracking) { entry.trackingScale = tracking.scale; evidence.push({fontId: font.fontId, kind: "tracking", samples: tracking.count, scale: tracking.scale}); }
    if (kashida) { entry.kashidaUnit = kashida.scale; evidence.push({fontId: font.fontId, kind: "kashida", samples: kashida.count, scale: kashida.scale}); }
    if (Object.keys(entry).length) fitted[font.fontId] = entry;
  }
  const defaults: FontSpacingCalibration = {};
  for (const kind of ["space", "tracking", "kashida"] as const) {
    const scales = evidence.filter((item) => item.kind === kind).map((item) => item.scale);
    if (scales.length) defaults[kind === "space" ? "spaceScale" : kind === "tracking" ? "trackingScale" : "kashidaUnit"] = median(scales);
  }
  return {
    version: 1,
    ...(Object.keys(fitted).length ? {fonts: fitted} : {}),
    ...(Object.keys(defaults).length ? {default: defaults} : {}),
    evidence,
  };
}

/** Convert a probe raster measurement (pixels) into points. */
function measuredPoints(sample: OracleSpacingSample, probe: OracleSpacingProbe): number | undefined {
  const values = probe.metric === "width" ? sample.widths : sample.advances;
  if (!values?.length) return undefined;
  const dpi = probe.dpi ?? 72;
  if (!Number.isFinite(dpi) || dpi <= 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) * (72 / dpi);
}

/**
 * Convert oracle JSON (samples carrying `probe` metadata) into a fit.
 * Perturbation samples are paired with a same-marker `baseline` sample by
 * `fontId|groupId`; pixel measurements are converted to points with `dpi`.
 */
export function fitCalibrationFromOracle(samples: readonly OracleSpacingSample[]): SpacingCalibrationReport {
  const baselines = new Map<string, number>();
  for (const sample of samples) {
    const probe = sample.probe;
    if (!probe || probe.kind !== "baseline") continue;
    const measured = measuredPoints(sample, probe);
    if (measured === undefined) continue;
    baselines.set(`${probe.fontId}|${probe.groupId ?? ""}`, measured);
  }
  const byFont = new Map<string, SpacingProbeMeasurement[]>();
  for (const sample of samples) {
    const probe = sample.probe;
    if (!probe || probe.kind === "baseline" || probe.naturalAdvance === undefined) continue;
    const measured = measuredPoints(sample, probe);
    if (measured === undefined) continue;
    const baseline = baselines.get(`${probe.fontId}|${probe.groupId ?? ""}`);
    const measurement: SpacingProbeMeasurement = {
      kind: probe.kind,
      naturalAdvance: probe.naturalAdvance,
      measuredAdvance: measured,
      ...(baseline !== undefined ? {baselineMeasuredAdvance: baseline} : {}),
      ...(probe.metric !== undefined ? {metric: probe.metric} : {}),
      ...(probe.count !== undefined ? {count: probe.count} : {}),
      ...(probe.gaps !== undefined ? {gaps: probe.gaps} : {}),
      ...(probe.trackingPoints !== undefined ? {trackingPoints: probe.trackingPoints} : {}),
      ...(probe.unitAdvance !== undefined ? {unitAdvance: probe.unitAdvance} : {}),
    };
    const list = byFont.get(probe.fontId) ?? [];
    list.push(measurement);
    byFont.set(probe.fontId, list);
  }
  if (byFont.size === 0) {
    throw new Error("Oracle file has no samples with probe metadata (kind/fontId/naturalAdvance)");
  }
  return fitSpacingCalibration([...byFont].map(([fontId, fontSamples]) => ({fontId, samples: fontSamples})));
}

/**
 * Describe measurable single-variable probes. Each family has a same-marker
 * baseline so the fitter can cancel the marker's own native advance.
 */
export function buildSpacingProbeCorpus(
  fontIds: readonly string[],
  vocabulary: SpacingProbeVocabulary = ARABIC_PROBE_VOCABULARY,
): SpacingProbeCorpus {
  const probes: SpacingProbeDescriptor[] = [];
  for (const fontId of fontIds) {
    const spacesGroup = `${fontId}-spaces`;
    probes.push({
      name: `${spacesGroup}-0`,
      kind: "baseline",
      fontId,
      groupId: spacesGroup,
      text: vocabulary.baselineText,
      expectedGlyphs: 2,
      note: "Baseline markers with no spaces. Export this exact text.",
    });
    for (const count of [2, 4, 8]) {
      probes.push({
        name: `${spacesGroup}-${count}`,
        kind: "space",
        fontId,
        groupId: spacesGroup,
        text: `${vocabulary.spaceMarker}${" ".repeat(count)}${vocabulary.spaceMarker}`,
        expectedGlyphs: 2,
        count,
        note: `Marker, ${count} plain space(s), marker. The two markers are the ink runs.`,
      });
    }

    const trackingGroup = `${fontId}-tracking`;
    probes.push({
      name: `${trackingGroup}-0`,
      kind: "baseline",
      fontId,
      groupId: trackingGroup,
      text: vocabulary.trackingText,
      expectedGlyphs: 5,
      note: "Five non-joining markers with zero tracking.",
    });
    for (const trackingPoints of [0.25, 0.5, 1]) {
      probes.push({
        name: `${trackingGroup}-${trackingPoints}`,
        kind: "tracking",
        fontId,
        groupId: trackingGroup,
        text: vocabulary.trackingText,
        expectedGlyphs: 5,
        gaps: 4,
        trackingPoints,
        note: `Same five markers with ${trackingPoints} pt tracking between them.`,
      });
    }

    if (vocabulary.kashidaText) {
      const kashidaGroup = `${fontId}-kashida`;
      probes.push({
        name: `${kashidaGroup}-0`,
        kind: "baseline",
        fontId,
        groupId: kashidaGroup,
        text: vocabulary.kashidaText,
        expectedGlyphs: 1,
        metric: "width",
        note: "Baseline kashida-capable word with no inserted kashida.",
      });
      for (const count of [1, 2, 4]) {
        probes.push({
          name: `${kashidaGroup}-${count}`,
          kind: "kashida",
          fontId,
          groupId: kashidaGroup,
          text: vocabulary.kashidaText,
          expectedGlyphs: 1,
          metric: "width",
          count,
          note: `Same word with ${count} native kashida extension(s) inserted.`,
        });
      }
    }

    probes.push({
      name: `${fontId}-mixed`,
      kind: "mixed",
      fontId,
      groupId: `${fontId}-mixed`,
      text: vocabulary.kashidaText || vocabulary.baselineText,
      expectedGlyphs: 2,
      note: "Validation line; not used in the fit.",
    });
  }
  return {version: 1, probes};
}
