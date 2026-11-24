/**
 * Per-font spacing corrections measured from the native oracle (ADR-020 item 7).
 *
 * These are metric multipliers, not per-document tuning:
 * - `spaceScale` corrects the font's natural space advance.
 * - `trackingScale` corrects style tracking (trackingEm/trackingPoints).
 * - `kashidaUnit` corrects the native kashida extension advance.
 *
 * Identity (1, 1, 1) is the default, so absent calibration cannot change
 * rendering.
 */
export interface FontSpacingCalibration {
  spaceScale?: number;
  trackingScale?: number;
  kashidaUnit?: number;
}

export interface SpacingCalibration {
  /** Applied to fonts without an explicit entry. */
  default?: FontSpacingCalibration;
  fonts?: Record<string, FontSpacingCalibration>;
}

/**
 * Document-level spacing priors extracted offline from a reference PDF's
 * content stream (Tc / Tw). They act as defaults when a run carries no
 * decoded source spacing.
 */
export interface SpacingPriors {
  /** Per-glyph tracking in points (PDF Tc). */
  characterSpacing?: number;
  /** Per-space extra advance in points (PDF Tw, divided by the space count). */
  wordSpacing?: number;
}

export interface ResolvedSpacingCalibration {
  spaceScale: number;
  trackingScale: number;
  kashidaUnit: number;
}

/** Optional spacing inputs threaded from RenderTypography to the layout. */
export interface SpacingOptions {
  calibration?: SpacingCalibration;
  priors?: SpacingPriors;
}

function finiteOr(value: number | undefined, fallback: number, allowZero: boolean): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  if (value < 0 || (!allowZero && value === 0)) return fallback;
  return value;
}

/** Resolve the correction for one font, falling back to the default entry. */
export function resolveSpacingCalibration(
  calibration: SpacingCalibration | undefined,
  fontId: string | undefined,
): ResolvedSpacingCalibration {
  const entry = fontId ? calibration?.fonts?.[fontId] : undefined;
  const fallback = calibration?.default;
  return {
    spaceScale: finiteOr(entry?.spaceScale ?? fallback?.spaceScale, 1, false),
    trackingScale: finiteOr(entry?.trackingScale ?? fallback?.trackingScale, 1, true),
    kashidaUnit: finiteOr(entry?.kashidaUnit ?? fallback?.kashidaUnit, 1, true),
  };
}
