/**
 * InPage v1/v2 legacy byte→Unicode character maps.
 *
 * These are factual Unicode assignment tables derived from the MIT-licensed
 * `iamahsanmehmood/inpage-format` specification (specs/05-character-maps.md),
 * cross-checked against independent public converters. Character mapping data
 * is factual Unicode assignment data, not copyrightable expression.
 *
 * The encoding: every InPage character is `0x04 <index>` (2 bytes), where
 * `<index>` is the key below. Composite sequences are 4 bytes
 * (`04 <base> 04 <modifier>`) and MUST be matched before single-byte lookups.
 */

export type Mode = "urdu" | "arabic";

/** Composite (4-byte) sequences, keyed as `${baseHex}_${modifierHex}`. */
export const COMPOSITE_SEQUENCES: Record<string, string> = {
  "81_BF": "\u0623", // Alef + Hamza Above → أ
  "81_B3": "\u0622", // Alef + Madda Above → آ
  "A2_BF": "\u0624", // Wao + Hamza Above → ؤ
  "A4_BF": "\u06CC\u0626", // Farsi Yeh + Hamza Above → یئ
};

/** Urdu-mode letter map (second byte after `0x04`). */
export const CHAR_MAP_URDU: Record<number, string> = {
  0x81: "\u0627", // ا Alef
  0x82: "\u0628", // ب Beh
  0x83: "\u067E", // پ Peh
  0x84: "\u062A", // ت Teh
  0x85: "\u0679", // ٹ Tteh
  0x86: "\u062B", // ث Theh
  0x87: "\u062C", // ج Jeem
  0x88: "\u0686", // چ Tcheh
  0x89: "\u062D", // ح Hah
  0x8a: "\u062E", // خ Khah
  0x8b: "\u062F", // د Dal
  0x8c: "\u0688", // ڈ Ddal
  0x8d: "\u0630", // ذ Thal
  0x8e: "\u0631", // ر Reh
  0x8f: "\u0691", // ڑ Rreh
  0x90: "\u0632", // ز Zain
  0x91: "\u0698", // ژ Jeh
  0x92: "\u0633", // س Seen
  0x93: "\u0634", // ش Sheen
  0x94: "\u0635", // ص Sad
  0x95: "\u0636", // ض Dad
  0x96: "\u0637", // ط Tah
  0x97: "\u0638", // ظ Zah
  0x98: "\u0639", // ع Ain
  0x99: "\u063A", // غ Ghain
  0x9a: "\u0641", // ف Feh
  0x9b: "\u0642", // ق Qaf
  0x9c: "\u06A9", // ک Keheh (Urdu Kaf)
  0x9d: "\u06AF", // گ Gaf
  0x9e: "\u0644", // ل Lam
  0x9f: "\u0645", // م Meem
  0xa0: "\u0646", // ن Noon
  0xa1: "\u06BA", // ں Noon Ghunna
  0xa2: "\u0648", // و Wao
  0xa3: "\u0621", // ء Hamza (standalone)
  0xa4: "\u06CC", // ی Farsi Yeh
  0xa5: "\u06D2", // ے Yeh Barree
  0xa6: "\u06C1", // ہ Heh Goal
  0xa7: "\u06BE", // ھ Heh Doachashmee
  0xb9: "\u06C3", // ۃ Teh Marbuta Goal

  // Diacritics
  0xa8: "\u064D", // ٍ Kasratan
  0xaa: "\u0650", // ِ Kasra (zer)
  0xab: "\u064E", // َ Fatha (zabar)
  0xac: "\u064F", // ُ Damma (pesh)
  0xad: "\u0651", // ّ Shadda
  0xb0: "\u0656", // ٖ Subscript Alef (khari zer)
  0xb1: "\u0652", // ْ Sukun (jazm)
  0xb3: "\u0653", // ٓ Maddah Above
  0xb5: "\u064C", // ٌ Dammatan
  0xbd: "\u0670", // ٰ Superscript Alef (khari zabar)
  0xbe: "\u0657", // ٗ Inverted Damma
  0xbf: "\u0654", // ٔ Hamza Above (primary)
  0xc7: "\u064B", // ً Fathatan

  // Alternate diacritic encodings
  0xc1: "\u0657", // Inverted Damma
  0xc2: "\u0654", // Hamza Above
  0xc3: "\u0655", // Hamza Below
  0xc6: "\u0651", // Shadda
  0xc9: "\u0670", // Superscript Alef
  0xca: "\u0656", // Subscript Alef
  0xcc: "\u0614", // Sign Takhallus
  0xcd: "\u060C", // Arabic Comma

  // Numerals (Extended Arabic-Indic)
  0xd0: "\u06F0", // ۰
  0xd1: "\u06F1", // ۱
  0xd2: "\u06F2", // ۲
  0xd3: "\u06F3", // ۳
  0xd4: "\u06F4", // ۴
  0xd5: "\u06F5", // ۵
  0xd6: "\u06F6", // ۶
  0xd7: "\u06F7", // ۷
  0xd8: "\u06F8", // ۸
  0xd9: "\u06F9", // ۹

  // Punctuation and symbols
  0xa9: "\u0640", // ـ Kashida / Tatweel
  0xda: "\u0021", // !
  0xdb: "\uFD3E", // ﴾
  0xdc: "\uFD3F", // ﴿
  0xdf: "\u002F", // /
  0xe1: "\u0029", // )
  0xe2: "\u0028", // (
  0xe4: "\u002B", // +
  0xe8: "\u066D", // ٭
  0xe9: "\u003A", // :
  0xea: "\u061B", // ؛
  0xeb: "\u00D7", // ×
  0xec: "\u003D", // =
  0xed: "\u060C", // ،
  0xee: "\u061F", // ؟
  0xef: "\u00F7", // ÷
  0xf1: "\u002F", // /
  0xf2: "\u060E", // ؎
  0xf3: "\u06D4", // ۔ Urdu Full Stop
  0xf5: "\u002D", // -
  0xf6: "\uFDFA", // ﷺ
  0xf7: "\u0601", // ؁
  0xf8: "\u0610", // ؐ
  0xf9: "\u002C", // ,
  0xfa: "\u005D", // ]
  0xfb: "\u005B", // [
  0xfc: "\u002E", // .
  0xfd: "\u2018", // '
  0xfe: "\u2019", // '
  0x20: "\u0020", // space

  // Religious / special
  0xae: "\u0611", // ؑ
  0xcf: "\u0614", // ؔ
  0xe6: "\u0613", // ؓ
  0xe7: "\u0612", // ؒ
};

/** Arabic-mode overrides (different codepoint for the same byte). */
export const CHAR_MAP_ARABIC: Record<number, string> = {
  0x9c: "\u0643", // ك Arabic Kaf
  0xa4: "\u064A", // ي Arabic Yeh
  0xa6: "\u0647", // ه Arabic Heh
  0xb8: "\u064A", // ي Arabic Yeh
  0x7c: "\u0660", // ٠
  0x7d: "\u0661", // ١
  0x7e: "\u0662", // ٢
  0x7f: "\u0663", // ٣
  0x80: "\u0664", // ٤
  0x81: "\u0665", // ٥
  0x82: "\u0666", // ٦
  0x83: "\u0667", // ٧
  0x84: "\u0668", // ٨
  0x85: "\u0669", // ٩
};

export function lookupChar(code: number, mode: Mode): string | undefined {
  if (mode === "arabic") {
    const arabic = CHAR_MAP_ARABIC[code];
    if (arabic !== undefined) return arabic;
  }
  return CHAR_MAP_URDU[code];
}

export function lookupComposite(base: number, modifier: number): string | undefined {
  const key = `${base.toString(16).toUpperCase()}_${modifier.toString(16).toUpperCase()}`;
  return COMPOSITE_SEQUENCES[key];
}
