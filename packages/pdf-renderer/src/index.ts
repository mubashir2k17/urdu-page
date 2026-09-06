export { PdfLibBackend, createPdfLibBackend } from "./pdflib-backend.js";
export { renderPdf, NodeFallbackFont, A4_WIDTH, A4_HEIGHT, MARGIN } from "./render.js";
export type { RenderPdfResult, FallbackFont, RenderTypography } from "./render.js";
export type { PdfBackend } from "./backend.js";
export { registerFontProvider, getFontProviders } from "./font-provider.js";
export type { FontProvider } from "./font-provider.js";
