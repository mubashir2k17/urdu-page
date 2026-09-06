import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PdfLibBackend } from "@inpage/pdf-renderer";
import { HarfBuzzTextShaper } from "@inpage/text-shaper";
import { loadInPageTypography } from "./inpage-fonts.js";

const typography = loadInPageTypography(resolve(process.argv[2] ?? "fonts/inpage-local"));
const font = { id: "embedded-fallback", bytes: readFileSync(resolve("fonts/NotoNastaliqUrdu-Regular.ttf")) };
const fallback = new HarfBuzzTextShaper();
const words = ["نستعلیق", "پیج", "مکمل", "میں", "پبلشنگ", "پیکیج", "نمبر", "بہت", "کثیر", "متن", "کی", "ہے"];
const rows = words.map((text) => {
  const input = { text, font, direction: "rtl" as const, script: "arab", language: "ur" };
  return { text, original: typography.shaper.shape(input), fallback: fallback.shape(input) };
});
const backend = await PdfLibBackend.create();
await backend.setFont(font.bytes, font.id);
const used = new Set(rows.flatMap(({ original }) => original.glyphs.flatMap(({ fontId }) => fontId ? [fontId] : [])));
for (const font of typography.fonts) if (used.has(font.id)) await backend.registerFont(font.bytes, font.id);
backend.addPage(595.28, 841.89);
rows.forEach((row, index) => {
  const y = 696 - index * 49;
  backend.drawShapedRun(row.fallback, 230 - backend.measureShapedRun(row.fallback, 24), y, 24);
  backend.drawShapedRun(row.original, 520 - backend.measureShapedRun(row.original, 24), y, 24);
});
const pdf = await PDFDocument.load(await backend.save());
const label = await pdf.embedFont(StandardFonts.Helvetica);
const page = pdf.getPage(0);
page.drawText("InPage font recovery", { x: 40, y: 789, size: 22, font: label });
page.drawText("Same logical words, same 24 pt size. Original outlines from local font banks.", {
  x: 40, y: 765, size: 10, font: label, color: rgb(0.3, 0.3, 0.3) });
page.drawText("Noto Nastaliq Urdu", { x: 80, y: 732, size: 12, font: label });
page.drawText("Recovered InPage Noori", { x: 348, y: 732, size: 12, font: label });
rows.forEach((row, index) => {
  const y = 696 - index * 49;
  const bank = row.original.glyphs[0]?.fontId;
  if (!bank) throw new Error(`Preview word has no recovered glyph: ${row.text}`);
  page.drawText(bank.replace("inpage-noorin-", "NOORIN "), { x: 282, y: y - 4, size: 8, font: label, color: rgb(0.4, 0.4, 0.4) });
});
page.drawText("Experimental whole-word mapping. Source spacing and multi-component ligatures remain unresolved.", {
  x: 40, y: 55, size: 9, font: label, color: rgb(0.3, 0.3, 0.3) });
mkdirSync(resolve("output/pdf"), { recursive: true });
writeFileSync(resolve("output/pdf/inpage-font-comparison.pdf"), await pdf.save());
console.log("Created output/pdf/inpage-font-comparison.pdf");
