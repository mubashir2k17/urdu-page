/**
 * Prefix 05 alphabet, identified from the supplied ZoharSindhi glyph atlas.
 * Contextual slots are factual assignments from the native table at 0x501200:
 * isolated, final, medial, initial. Zero means that form does not exist.
 */
const letters = [
  "ا", "ب", "ٻ", "ڀ", "ت", "ٺ", "ٽ", "ٿ", "ث", "پ", "ج", "ڄ", "ڃ", "چ", "ڇ", "ح",
  "خ", "د", "ڌ", "ڏ", "ڊ", "ڍ", "ذ", "ر", "ڙ", "ز", "س", "ش", "ص", "ض", "ط", "ظ",
  "ع", "غ", "ف", "ڦ", "ق", "ڪ", "ک", "گ", "ڳ", "ڱ", "ء", "۾", "ي", "ل", "م", "ن",
  "ڻ", "و", "ه", "ھ",
];
const slots = [
  "66670000","686b6a69","6c6f6e6d","70737271","74777675","787b7a79","7c807e7d","81848382",
  "85888786","898c8b8a","8d908f8e","91949392","95989796","999c9b9a","9da19f9e","a2a5a4a3",
  "a6a9a8a7","aaab0000","acad0000","aeaf0000","b0b10000","b2b30000","b4b50000","b6b70000",
  "b8b90000","babb0000","bcbfbebd","c0c3c2c1","c4c7c6c5","c8cbcac9","cccfcecd","d0d3d2d1",
  "d4d7d6d5","d8dbdad9","dcdfdedd","e0e3e2e1","e4e7e6e5","e8e9e9e8","eaedeceb","eef1f0ef",
  "f2f5f4f3","f6f9f8f7","fafafcfb","fdfe0000","4a4d4c4b","4e51504f","52555453","56595857",
  "5a5d5c5b","5e5f0000","60610000","62656463",
];
export const SINDHI_CHARACTERS: Readonly<Record<number,string>> = {
  ...Object.fromEntries(letters.map((letter,index)=>[0x81+index,letter])),
  0x20:" ", 0xb5:"!",0xb6:"«",0xb7:"+",0xb8:"−",0xb9:"×",0xba:"=",0xbb:"»",0xbc:"(",0xbd:")",
  0xbe:"/",0xbf:"%",0xc0:"‘",0xc1:"-",0xc2:".",0xc3:"،",
  0xc4:"٠",0xc5:"١",0xc6:"٢",0xc7:"٣",0xc8:"٤",0xc9:"٥",0xca:"٦",0xcb:"٧",0xcc:"٨",0xcd:"٩",
  0xce:":",0xcf:"؛",0xd0:"ّ",0xd1:"ْ",0xd2:"ٰ",0xd3:"؟",0xd4:"۽",0xd5:"ٓ",0xd6:"ٌ",0xd7:"ُ",
  0xd8:"ً",0xd9:"َ",0xda:"ٍ",0xdb:"ِ",0xdc:"ٔ",0xdd:"ٕ",
};
export const SINDHI_CONTEXTUAL_SLOTS: ReadonlyMap<number,readonly number[]> = new Map<number,readonly number[]>([
  ...slots.map((hex,index)=>[0x81+index,hex.match(/../g)!.map(byte=>parseInt(byte,16))] as const),
  ...Array.from({length:0xdd-0xb5+1},(_,index)=>[0xb5+index,[0x21+index,0,0,0]] as const),
]);
