import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { decodeInPageFontData, LegacyLigatureTextShaper, type LegacyLigatureGlyph } from "@inpage/text-shaper";
import type { RenderTypography } from "@inpage/pdf-renderer";
import { CHAR_MAP_URDU } from "../packages/inp-parser/src/charmap.js";

const DATA_SHA256 = "b4f4136b8b4e36ebcd3bb101904be79c35786437334fcd8a7e7c89253ba3225d";
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export function importInPageFonts(source: string, destination: string): void {
  const data = readFileSync(join(source, "INPAGEU.DAT"));
  if (sha256(data) !== DATA_SHA256) throw new Error("Unrecognized INPAGEU.DAT; inspect its layout before importing");
  const ligatures = decodeInPageFontData(data);
  const inventory = [];
  mkdirSync(destination, { recursive: true });
  for (const file of readdirSync(source).sort()) {
    if (!/\.(ttf|utf|fon)$/i.test(file)) continue;
    const bytes = readFileSync(join(source, file));
    const isTrueType = bytes.readUInt32BE(0) === 0x00010000;
    const font = isTrueType ? fontkit.create(bytes) : undefined;
    const tables = isTrueType ? Array.from({ length: bytes.readUInt16BE(4) }, (_, index) =>
      bytes.toString("ascii", 12 + index * 16, 16 + index * 16)) : [];
    inventory.push({
      file, sha256: sha256(bytes), bytes: bytes.length, tables,
      ...(font && "glyphForCodePoint" in font ? {
        family: font.familyName, glyphs: font.numGlyphs, unitsPerEm: font.unitsPerEm,
        unicodeArabicCharacters: font.characterSet.filter((code) => code >= 0x600 && code <= 0x6ff).length,
      } : {}),
    });
    copyFileSync(join(source, file), join(destination, file));
  }
  copyFileSync(join(source, "INPAGEU.DAT"), join(destination, "INPAGEU.DAT"));
  writeFileSync(join(destination, "inventory.json"), JSON.stringify({
    dataSha256: DATA_SHA256, ligatureCount: ligatures.length, fonts: inventory,
  }, null, 2) + "\n");
  console.log(`Copied ${inventory.length} font files; decoded ${ligatures.length} ligature mappings into ${destination}`);
}

/** Only complete words mapping to one original glyph are eligible. */
export function loadInPageTypography(directory: string): RenderTypography {
  const data = readFileSync(join(directory, "INPAGEU.DAT"));
  if (sha256(data) !== DATA_SHA256) throw new Error("Unrecognized INPAGEU.DAT");
  const fonts: RenderTypography["fonts"] = [];
  const banks = new Map<number, fontkit.Font>();
  for (const file of readdirSync(directory).sort()) {
    const match = /^NOORIN(\d{2})\.(TTF|UTF)$/i.exec(file);
    if (!match) continue;
    const bank = Number(match[1]);
    const bytes = readFileSync(join(directory, file));
    const font = fontkit.create(bytes);
    if (!("glyphForCodePoint" in font)) throw new Error("Font collections are not supported");
    banks.set(bank, font);
    fonts.push({ id: `inpage-noorin-${bank}`, bytes });
  }
  const candidates = new Map<string, LegacyLigatureGlyph>();
  const ambiguous = new Set<string>();
  for (const entry of decodeInPageFontData(data)) {
    if (entry.components.length !== 1) continue;
    // Plain letters only; composite/diacritic interpretation needs more evidence.
    if (entry.legacyCodes.some((code) => code < 0x81 || code > 0xa7)) continue;
    const text = entry.legacyCodes.map((code) => CHAR_MAP_URDU[code]).join("");
    const { bank, slot } = entry.components[0]!;
    const font = banks.get(bank);
    if (!font) continue;
    const glyph = font.glyphForCodePoint(0xf000 + slot);
    if (!glyph.id) continue;
    const value = { text, fontId: `inpage-noorin-${bank}`, glyphId: glyph.id,
      advance: glyph.advanceWidth, unitsPerEm: font.unitsPerEm };
    const prior = candidates.get(text);
    if (prior && (prior.fontId !== value.fontId || prior.glyphId !== value.glyphId)) ambiguous.add(text);
    candidates.set(text, value);
  }
  for (const text of ambiguous) candidates.delete(text);
  const entries = [...candidates.values()];
  const usedFonts = new Set(entries.map(({ fontId }) => fontId));
  console.log(`Enabled ${entries.length} single-glyph word mappings across ${usedFonts.size} Noori banks`);
  return { shaper: new LegacyLigatureTextShaper(entries), fonts: fonts.filter(({ id }) => usedFonts.has(id)) };
}
