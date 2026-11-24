// CLI for the NOORIC oracle corpus. It measures rasterised single-property
// documents and writes advances suitable for fitting/validating the shaper.
//
// The vendor executable is never launched by this tool. Produce the oracle
// rasters separately (native InPage export or equivalent controlled
// documents), then point a manifest at them:
//
//   npm run nooric:oracle -- --manifest tmp/oracle/manifest.json
//
// Manifest shape:
//   {
//     "samples": [
//       { "name": "beh-isolated", "image": "tmp/oracle/beh-isolated.pgm",
//         "expectedGlyphs": 1, "threshold": 32, "minGap": 1,
//         "yMin": 0, "yMax": 200 }
//     ]
//   }

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { measureGlyphAdvances, parsePgm } from "./oracle-measure.js";
import type { OracleSpacingProbe } from "./spacing-calibration.js";

interface OracleSample {
  name: string;
  image: string;
  expectedGlyphs?: number;
  threshold?: number;
  minGap?: number;
  yMin?: number;
  yMax?: number;
  /** Optional single-variable spacing probe metadata for calibration fitting. */
  probe?: OracleSpacingProbe;
}

interface OracleManifest {
  samples: OracleSample[];
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const manifestPath = argumentValue("--manifest");
if (!manifestPath) {
  throw new Error("Usage: npm run nooric:oracle -- --manifest <manifest.json> [--out <json>]");
}
const output = resolve(argumentValue("--out") ?? "tmp/reverse-engineering/nooric-oracle.json");
const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8")) as OracleManifest;
if (!Array.isArray(manifest.samples) || manifest.samples.length === 0) {
  throw new Error("Manifest must contain a non-empty samples array");
}

const samples = manifest.samples.map((sample) => {
  const image = parsePgm(readFileSync(resolve(sample.image)));
  const measurements = measureGlyphAdvances(image, {
    ...(sample.threshold === undefined ? {} : { threshold: sample.threshold }),
    ...(sample.minGap === undefined ? {} : { minGap: sample.minGap }),
    ...(sample.yMin === undefined ? {} : { yMin: sample.yMin }),
    ...(sample.yMax === undefined ? {} : { yMax: sample.yMax }),
  });
  return {
    name: sample.name,
    image: sample.image,
    expectedGlyphs: sample.expectedGlyphs ?? measurements.intervals.length,
    ...(sample.probe ? {probe: sample.probe} : {}),
    ...measurements,
  };
});

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ version: 1, samples }, null, 2)}\n`, "utf8");
for (const sample of samples) {
  console.log(
    `${sample.name}: ${sample.intervals.length} glyph(s), advances [${sample.advances.join(", ")}]`,
  );
}
console.log(`Wrote ${output}`);

/**
 * Documented dev-only invocation. The vendor executable stays an input to the
 * manual oracle workflow and is never committed or executed by CI.
 */
export function wineInvocation(exe: string, wine = "wine"): { command: string; args: string[] } {
  return { command: wine, args: [exe] };
}
