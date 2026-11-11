import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { decodeInPageFontData, readInPageBankMetrics, readInPageIsolatedGlyph, HarfBuzzTextShaper, LegacyLigatureTextShaper, type LegacyLigatureGlyph } from "@inpage/text-shaper";
import type { RenderTypography } from "@inpage/pdf-renderer";
import { CHAR_MAP_URDU } from "../packages/inp-parser/src/charmap.js";
import { loadArabicFontFamilies } from "./inpage-arabic-fonts.js";
import { extractNooricTables } from "./nooric-table.js";

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
  for (const exeName of ["Inpage 2018_original.exe", "Inpage 2018.exe", "Inpage.exe"]) {
    const exePath = join(source, exeName);
    if (!existsSync(exePath)) continue;
    try {
      const tables = extractNooricTables(readFileSync(exePath));
      writeFileSync(join(destination, "nooric-tables.json"), `${JSON.stringify(tables)}\n`);
      console.log(`Extracted NOORIC record tables from ${exeName}`);
    } catch (error) {
      console.warn(`Could not extract NOORIC tables from ${exeName}: ${(error as Error).message}`);
    }
    break;
  }
  console.log(`Copied ${inventory.length} font files; decoded ${ligatures.length} ligature mappings into ${destination}`);
}

/** Complete-word mappings with verified advancing/overlay component structure. */
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
    // Explicit trie terminals include marked forms as well as plain ligatures.
    if (entry.legacyCodes.some((code) => !CHAR_MAP_URDU[code])) continue;
    const text = entry.legacyCodes.map((code) => CHAR_MAP_URDU[code]).join("").normalize("NFC");
    const { bank, slot } = entry.components[0]!;
    const font = banks.get(bank);
    if (!font) continue;
    const metrics = readInPageBankMetrics(data, bank, slot);
    if (!metrics.width) continue;
    const glyph = font.glyphForCodePoint(0xf000 + slot);
    if (!glyph.id) continue;
    // 0x4092c1 adds the executable's 65-unit default spacing for non-space
    // Noori glyphs, then divides by the bank's slot-zero metric denominator.
    const value: LegacyLigatureGlyph = { text, fontId: `inpage-noorin-${bank}`, glyphId: glyph.id,
      advance: metrics.width + 65, unitsPerEm: metrics.unitsPerEm,
      kerning:{right:metrics.right,left:metrics.left,clearance:85} };
    const second = entry.components[1];
    if (second) {
      const overlayFont = banks.get(second.bank);
      if (!overlayFont || readInPageBankMetrics(data, second.bank, second.slot).width !== 0) continue;
      const overlay = overlayFont.glyphForCodePoint(0xf000 + second.slot);
      if (!overlay.id) continue;
      value.overlay = { fontId: `inpage-noorin-${second.bank}`, glyphId: overlay.id };
    }
    const prior = candidates.get(text);
    if (prior && JSON.stringify(prior) !== JSON.stringify(value)) ambiguous.add(text);
    candidates.set(text, value);
  }
  for (const text of ambiguous) candidates.delete(text);
  for (let code = 0x20; code <= 0xff; code++) {
    const component = readInPageIsolatedGlyph(data, code);
    const text = CHAR_MAP_URDU[code];
    if (!component || !text || candidates.has(text)) continue;
    const font = banks.get(component.bank);
    const glyph = font?.glyphForCodePoint(0xf000 + component.slot);
    if (!glyph?.id) continue;
    const metrics = readInPageBankMetrics(data, component.bank, component.slot);
    if (!metrics.width) continue;
    candidates.set(text, {text, fontId:`inpage-noorin-${component.bank}`, glyphId:glyph.id,
      advance:metrics.width + 65, unitsPerEm:metrics.unitsPerEm,
      kerning:{right:metrics.right,left:metrics.left,clearance:85}});
  }
  const entries = [...candidates.values()];
  // 0x40bbee–0x40bc65 tightens bank 82 slots 71/72 immediately after
  // bank 1 slot 5A (Alef), before applying the ordinary boundary clearance.
  const alef=banks.get(1)?.glyphForCodePoint(0xf05a);
  if(alef)for(const entry of entries) {
    if(entry.fontId!=="inpage-noorin-82" || !entry.kerning)continue;
    if([0x71,0x72].some(slot=>banks.get(82)?.glyphForCodePoint(0xf000+slot).id===entry.glyphId)) {
      entry.kerning.after=[{fontId:"inpage-noorin-1",glyphId:alef.id,adjustment:-200}];
    }
  }
  const usedFonts = new Set(entries.flatMap(({ fontId, overlay }) => overlay ? [fontId, overlay.fontId] : [fontId]));
  console.log(`Enabled ${entries.length} word mappings (${entries.filter(({ overlay }) => overlay).length} overlays) across ${usedFonts.size} Noori banks`);
  const latin = new Map<string, RenderTypography["fonts"][number]>();
  const cellScales = new Map<string,number>();
  for (const variant of ["", " Bold", " Italic", " Bold Italic"]) {
    const file = join(directory, `Arial${variant}.ttf`);
    if (!existsSync(file)) continue;
    const font = {id: `local-arial${variant.replaceAll(" ", "-").toLowerCase()}`, bytes: readFileSync(file)};
    latin.set(variant, font);
    const metrics=fontkit.create(font.bytes);
    if ("glyphForCodePoint" in metrics) cellScales.set(font.id,metrics.unitsPerEm/(metrics.ascent-metrics.descent));
  }
  const arabic = loadArabicFontFamilies(directory,data);
  const wineSymbol=existsSync(join(directory,"WineSymbol.ttf"));
  const symbolPath=join(directory,wineSymbol?"WineSymbol.ttf":"Symbol.ttf");
  const symbol=existsSync(symbolPath)?{id:"local-symbol",bytes:readFileSync(symbolPath)}:undefined;
  if(symbol){const metrics=fontkit.create(symbol.bytes);if("glyphForCodePoint" in metrics)cellScales.set(symbol.id,metrics.unitsPerEm/(metrics.ascent-metrics.descent));}
  const noori = new LegacyLigatureTextShaper(entries,true);
  const unicodeShaper=new HarfBuzzTextShaper();
  return {
    // Reproduce the 600 dpi Windows print placement used by the legacy profile.
    glyphPositionDpi:600,
    shaper: {shape(input) {
      if(wineSymbol && input.font.id===symbol?.id) {
        const run=unicodeShaper.shape({...input,text:input.text.replaceAll("←","\uf0ac")});
        return {...run,logicalText:input.text,fontSizeScale:cellScales.get(input.font.id) ?? 1};
      }
      const run=(arabic.shapers.get(input.font.id) ?? noori).shape(input);
      const fontSizeScale=cellScales.get(input.font.id);
      return fontSizeScale ? {...run,fontSizeScale} : run;
    }},
    fonts: [...fonts.filter(({ id }) => usedFonts.has(id)), ...latin.values(), ...arabic.fonts,...(symbol?[symbol]:[])],
    resolveFont(style, direction) {
      if(direction==="ltr" && style.latinFontName==="Symbol")return symbol;
      if (direction === "rtl" && style.arabicFontName) return arabic.names.get(style.arabicFontName);
      if (direction !== "ltr" || style.latinFontName !== "Arial") return undefined;
      return latin.get(`${style.bold ? " Bold" : ""}${style.italic ? " Italic" : ""}`);
    },
  };
}
