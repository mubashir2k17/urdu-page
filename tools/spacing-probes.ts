// Generate native-InPage spacing probe documents (no Wine required).
//
// The generated JSON is an oracle manifest with the natural advances already
// filled in. A human authors the listed documents in InPage on Windows,
// exports PDFs, rasterises them with `npm run spacing:rasterize`, then runs
// `npm run nooric:oracle` and `npm run spacing:calibrate --oracle`.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { RenderTypography } from "@inpage/pdf-renderer";
import type { ShapeFont, ShapedRun } from "@inpage/text-shaper";

import {
  ARABIC_PROBE_VOCABULARY,
  LATIN_PROBE_VOCABULARY,
  buildSpacingProbeCorpus,
  type OracleSpacingProbe,
  type SpacingProbeDescriptor,
  type SpacingProbeVocabulary,
} from "./spacing-calibration.js";

export interface SpacingProbeManifestSample {
  name: string;
  image: string;
  expectedGlyphs: number;
  probe: OracleSpacingProbe;
}

export interface SpacingProbeManifest {
  version: 1;
  fontName: string;
  fontId: string;
  fontSize: number;
  dpi: number;
  direction: "ltr" | "rtl";
  /** Aggregate fonts resolve per word; the fit applies as `default`. */
  aggregate: boolean;
  samples: SpacingProbeManifestSample[];
}

export interface SpacingProbeManifestOptions {
  typography: RenderTypography;
  fontName: string;
  fontSize?: number;
  dpi?: number;
  outputDirectory: string;
  /** Fallback face for aggregate fonts such as Noori Nastaliq. */
  fallbackFontPath?: string;
}

interface ResolvedProbeFont {
  font: ShapeFont;
  direction: "ltr" | "rtl";
  vocabulary: SpacingProbeVocabulary;
  script: string;
  language: string;
  /** True when the face is a probe label rather than a resolved render face. */
  aggregate: boolean;
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function resolveProbeFont(
  typography: RenderTypography,
  fontName: string,
  fontSize: number,
  fallbackFontPath?: string,
): ResolvedProbeFont {
  const rtl = typography.resolveFont?.({fontSize, arabicFontName: fontName}, "rtl");
  if (rtl) {
    return {font: rtl, direction: "rtl", vocabulary: ARABIC_PROBE_VOCABULARY, script: "arab", language: "ur", aggregate: false};
  }
  const ltr = typography.resolveFont?.({fontSize, latinFontName: fontName}, "ltr");
  if (ltr) {
    return {font: ltr, direction: "ltr", vocabulary: LATIN_PROBE_VOCABULARY, script: "latn", language: "en", aggregate: false};
  }
  // Aggregate fonts (Noori Nastaliq) resolve per word to NOORIN banks, so no
  // single face exists. Probe with the fallback face and label the entry so
  // the fitted correction lands in `default` for every render font.
  const path = fallbackFontPath ?? new URL("../fonts/NotoNastaliqUrdu-Regular.ttf", import.meta.url);
  const fallback: ShapeFont = {id: `probe-${slug(fontName)}`, bytes: readFileSync(path)};
  return {
    font: fallback,
    direction: "rtl",
    vocabulary: ARABIC_PROBE_VOCABULARY,
    script: "arab",
    language: "ur",
    aggregate: true,
  };
}

/** Points represented by one run's glyph advances. */
function runPoints(run: ShapedRun, fontSize: number): number {
  const scale = (fontSize * (run.fontSizeScale ?? 1)) / run.unitsPerEm;
  return run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0) * scale;
}

/**
 * Pen span the oracle measures: distance from the first to the last ink start.
 * This is the run advance minus the final glyph's own advance.
 */
function runSpanPoints(run: ShapedRun, fontSize: number): number {
  const scale = (fontSize * (run.fontSizeScale ?? 1)) / run.unitsPerEm;
  const total = run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
  const last = run.glyphs.at(-1)?.xAdvance ?? 0;
  return (total - last) * scale;
}

function probeNote(
  descriptor: SpacingProbeDescriptor,
  fontSize: number,
): string {
  if (descriptor.kind === "tracking" && descriptor.trackingPoints !== undefined) {
    return `${descriptor.note} Set tracking to ${descriptor.trackingPoints} pt ` +
      `(= ${(descriptor.trackingPoints / fontSize).toFixed(4)} em at ${fontSize} pt).`;
  }
  return descriptor.note;
}

export function buildSpacingProbeManifest(options: SpacingProbeManifestOptions): SpacingProbeManifest {
  const fontSize = options.fontSize ?? 24;
  const dpi = options.dpi ?? 300;
  const resolved = resolveProbeFont(options.typography, options.fontName, fontSize, options.fallbackFontPath);
  if (resolved.aggregate) {
    console.warn(
      `"${options.fontName}" resolves per word to multiple banks; probing with ` +
        `${resolved.font.id} and fitting the global default.`,
    );
  }
  const fontId = resolved.font.id;
  const shape = (text: string): ShapedRun => options.typography.shaper.shape({
    text,
    direction: resolved.direction,
    language: resolved.language,
    script: resolved.script,
    font: resolved.font,
  });

  const descriptors = buildSpacingProbeCorpus([fontId], resolved.vocabulary).probes;
  const baselineText = resolved.vocabulary.baselineText;
  const baselineSpan = runSpanPoints(shape(baselineText), fontSize);
  const kashidaRun = resolved.vocabulary.kashidaText ? shape(resolved.vocabulary.kashidaText) : undefined;
  const kashidaGlyph = kashidaRun?.glyphs.find((glyph) => glyph.kashida);
  const kashidaUnit = kashidaGlyph?.kashida
    ? kashidaGlyph.kashida.advance * (fontSize * (kashidaRun!.fontSizeScale ?? 1)) / kashidaRun!.unitsPerEm
    : undefined;
  if (resolved.vocabulary.kashidaText && kashidaUnit === undefined) {
    console.warn(`No kashida carrier found in "${resolved.vocabulary.kashidaText}"; skipping kashida probes.`);
  }

  const effective = descriptors.filter((descriptor) =>
    kashidaUnit !== undefined || !descriptor.groupId.endsWith("-kashida"));
  const samples: SpacingProbeManifestSample[] = [];
  for (const descriptor of effective) {
    const probe: OracleSpacingProbe = {
      kind: descriptor.kind,
      fontId,
      groupId: descriptor.groupId,
      dpi,
      text: descriptor.text,
      note: probeNote(descriptor, fontSize),
      fontSize,
      fontName: options.fontName,
      ...(descriptor.metric ? {metric: descriptor.metric} : {}),
      ...(descriptor.count !== undefined ? {count: descriptor.count} : {}),
      ...(descriptor.gaps !== undefined ? {gaps: descriptor.gaps} : {}),
      ...(descriptor.trackingPoints !== undefined ? {trackingPoints: descriptor.trackingPoints} : {}),
      ...(descriptor.kind === "kashida" && kashidaUnit !== undefined ? {unitAdvance: kashidaUnit} : {}),
    };
    if (descriptor.kind === "space" && descriptor.count !== undefined) {
      const span = runSpanPoints(shape(descriptor.text), fontSize);
      probe.naturalAdvance = span - baselineSpan;
    } else if (descriptor.kind === "tracking" && descriptor.trackingPoints !== undefined && descriptor.gaps) {
      probe.naturalAdvance = descriptor.gaps * descriptor.trackingPoints;
    } else if (descriptor.kind === "kashida" && descriptor.count !== undefined && kashidaUnit !== undefined) {
      probe.naturalAdvance = descriptor.count * kashidaUnit;
    }
    samples.push({
      name: descriptor.name,
      image: join(options.outputDirectory, `${descriptor.name}.pgm`),
      expectedGlyphs: descriptor.expectedGlyphs,
      probe,
    });
  }
  return {
    version: 1,
    fontName: options.fontName,
    fontId,
    fontSize,
    dpi,
    direction: resolved.direction,
    aggregate: resolved.aggregate,
    samples,
  };
}

/** Human checklist rendered next to the JSON manifest. */
export function renderSpacingProbeGuide(manifest: SpacingProbeManifest, outputDirectory: string): string {
  const rows = manifest.samples.map((sample) => {
    const text = sample.probe.text ?? "";
    const spacedText = text === "" ? "(empty)" : `"${text}"`;
    return `| ${sample.name} | ${spacedText} | ${sample.probe.note ?? ""} | ${sample.expectedGlyphs} |`;
  }).join("\n");
  return `# Spacing probe documents

Font: **${manifest.fontName}** (\`${manifest.fontId}\`)
Size: **${manifest.fontSize} pt**  ·  Raster DPI: **${manifest.dpi}**  ·  Direction: **${manifest.direction}**

${manifest.aggregate
  ? "This font is an aggregate of native banks, so the fitted correction is written to `default` and applies to every render font. Author the documents with the font selected in InPage exactly as named above."
  : "The fitted correction is keyed by the resolved render font id."}

## Steps (native Windows, no Wine)

1. Open InPage and create a new A4 document for each probe below.
2. Set the text font to **${manifest.fontName}** and the size to exactly
   **${manifest.fontSize} pt**. Use one text frame; leave default text wrapping.
3. Type the exact text from the table (spaces are significant). For tracking
   probes, set the application's tracking/character-spacing control to the
   value in the instruction. For kashida probes, insert exactly the stated
   number of kashidas.
4. Export each document as PDF into:
   \`${outputDirectory}\`
   using the probe name as the file name (e.g. \`${manifest.samples[0]?.name ?? "probe"}.pdf\`).
5. Rasterise all PDFs at ${manifest.dpi} dpi:

   \`\`\`powershell
   npm run spacing:rasterize -- --dir "${outputDirectory}" --dpi ${manifest.dpi}
   \`\`\`

6. Measure and fit:

   \`\`\`powershell
   npm run nooric:oracle -- --manifest "${join(outputDirectory, "spacing-probes.json")}" --out "${join(outputDirectory, "spacing-oracle.json")}"
   npm run spacing:calibrate -- --oracle "${join(outputDirectory, "spacing-oracle.json")}" --out "fonts/inpage-local/spacing-calibration.json"
   \`\`\`

7. Re-run \`npm run test:spacing\` to check the improvement.

## Probes

| Name | Exact text | Settings | Expected ink runs |
|---|---|---|---:|
${rows}
`;
}
