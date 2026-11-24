export { PdfLibBackend, createPdfLibBackend, computeGraphicBoundary } from "./pdflib-backend.js";
export type { GraphicBoundaryOptions } from "./pdflib-backend.js";
export { renderPdf, NodeFallbackFont, A4_WIDTH, A4_HEIGHT, MARGIN } from "./render.js";
export type { RenderPdfResult, FallbackFont, RenderTypography } from "./render.js";
export type { PdfBackend, TextAppearance } from "./backend.js";
export { advanceRun, runScale, stepGlyph } from "./pen-model.js";
export type { PenState, GlyphOrigin, RunMetricSource } from "./pen-model.js";
export { resolveSpacingCalibration } from "./spacing-calibration.js";
export type {
  FontSpacingCalibration,
  ResolvedSpacingCalibration,
  SpacingCalibration,
  SpacingOptions,
  SpacingPriors,
} from "./spacing-calibration.js";
export { registerFontProvider, getFontProviders } from "./font-provider.js";
export type { FontProvider } from "./font-provider.js";
