// CLI for spacing calibration (ADR-020 Phase 4).
//
// 1. Emit the single-variable oracle probe corpus:
//    npm run spacing:calibrate -- --probes --font inpage-noorin-82,inpage-noorin-1
//
// 2. Fit the measured oracle JSON:
//    npm run spacing:calibrate -- --oracle tmp/reverse-engineering/nooric-oracle.json
//
// 3. Or fit hand-transcribed measurements:
//    npm run spacing:calibrate -- --samples tmp/reverse-engineering/spacing-samples.json
//
// The fitted file defaults to fonts/inpage-local/spacing-calibration.json and
// is picked up automatically by loadInPageTypography when present.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { loadInPageTypography } from "./inpage-fonts.js";
import { buildSpacingProbeManifest, renderSpacingProbeGuide } from "./spacing-probes.js";
import {
  buildSpacingProbeCorpus,
  fitCalibrationFromOracle,
  fitSpacingCalibration,
  type FontSpacingSamples,
  type OracleSpacingSample,
} from "./spacing-calibration.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path}`);
}

if (process.argv.includes("--manifest")) {
  const fontsDirectory = resolve(argumentValue("--fonts-dir") ?? "fonts/inpage-local");
  const fontName = argumentValue("--font-name");
  if (!fontName) throw new Error("--manifest requires --font-name <InPage font name>");
  const fontSize = Number(argumentValue("--font-size") ?? "24");
  const dpi = Number(argumentValue("--dpi") ?? "300");
  const outputDirectory = resolve(argumentValue("--out-dir") ?? "tmp/reverse-engineering/spacing-probes");
  mkdirSync(outputDirectory, {recursive: true});
  const typography = loadInPageTypography(fontsDirectory);
  const manifest = buildSpacingProbeManifest({typography, fontName, fontSize, dpi, outputDirectory});
  writeJson(join(outputDirectory, "spacing-probes.json"), manifest);
  const guidePath = join(outputDirectory, "spacing-probes.md");
  writeFileSync(guidePath, renderSpacingProbeGuide(manifest, outputDirectory), "utf8");
  console.log(`Wrote ${manifest.samples.length} probes for ${manifest.fontName} (${manifest.fontId})`);
  console.log(`Wrote ${guidePath}`);
} else if (process.argv.includes("--probes")) {
  const fonts = (argumentValue("--font") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (fonts.length === 0) throw new Error("--probes requires --font <id[,id...]>");
  const output = resolve(argumentValue("--out") ?? "tmp/reverse-engineering/spacing-probes.json");
  const corpus = buildSpacingProbeCorpus(fonts);
  writeJson(output, corpus);
  console.log(`Described ${corpus.probes.length} probes for ${fonts.length} font(s).`);
} else {
  const oraclePath = argumentValue("--oracle");
  const samplesPath = argumentValue("--samples");
  if (!oraclePath && !samplesPath) {
    throw new Error(
      "Usage: spacing:calibrate -- --manifest --font-name <name> --fonts-dir <dir> | " +
        "--probes --font <ids> | --oracle <nooric-oracle.json> | --samples <fit-input.json>",
    );
  }
  const report = oraclePath
    ? fitCalibrationFromOracle(
        (JSON.parse(readFileSync(resolve(oraclePath), "utf8")) as {samples?: OracleSpacingSample[]}).samples ?? [],
      )
    : fitSpacingCalibration(
        (JSON.parse(readFileSync(resolve(samplesPath!), "utf8")) as {fonts?: FontSpacingSamples[]}).fonts ?? [],
      );
  const output = resolve(
    argumentValue("--out") ?? "fonts/inpage-local/spacing-calibration.json",
  );
  writeJson(output, report);
  for (const item of report.evidence) {
    console.log(`${item.fontId} ${item.kind}: x${item.scale.toFixed(4)} (${item.samples} sample(s))`);
  }
}
