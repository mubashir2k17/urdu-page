import type { Diagnostic } from "@inpage/diagnostics";
import type { Paragraph } from "@inpage/document-model";
import type { Mode } from "./charmap.js";
import { lookupChar, lookupComposite } from "./charmap.js";
import { SINDHI_CHARACTERS } from "./sindhi-map.js";

export interface LegacyDecodeOptions {
  mode?: Mode;
}

export interface LegacyDecodeResult {
  paragraphs: Paragraph[];
  /** Paragraph indices that begin a new page (page break before them). */
  pageBreakBefore: Set<number>;
  diagnostics: Diagnostic[];
}

export const PAGE_BREAK_MARKER = "__PAGE_BREAK__";

/**
 * Decode an InPage v1/v2 stream (flat `0x04`-prefix encoding).
 * Implements composite-before-single matching and the `pendingSpace` word
 * boundary heuristic.
 */
export function decodeLegacy(
  data: Uint8Array,
  options: LegacyDecodeOptions = {},
): LegacyDecodeResult {
  const mode: Mode = options.mode ?? "urdu";
  const paragraphs: Paragraph[] = [];
  const pageBreakBefore = new Set<number>();
  const diagnostics: Diagnostic[] = [];

  let current = "";
  let rawCodes: number[] = [];
  let charCodes: (number | undefined)[] = [];
  let pendingSpace = false;
  let paragraphStartOffset = 0;
  let paragraphIndex = 0;
  let i = 0;

  function appendText(text: string, code?: number): void {
    current += text;
    const scalarCount = [...text].length;
    // A code is usable only when it produced exactly one non-space scalar.
    // Composites and direct ASCII therefore retain explicit alignment gaps.
    const alignedCode = code !== undefined && scalarCount === 1 && text !== " " ? code : undefined;
    for (let scalar = 0; scalar < scalarCount; scalar++) charCodes.push(alignedCode);
  }

  function flushParagraph(): void {
    const text = current;
    if (text.length > 0) {
      paragraphs.push({
        index: paragraphIndex++,
        runs: [{ kind: "text", text, rawCodes: rawCodes.slice(), charCodes: charCodes.slice() }],
        startOffset: paragraphStartOffset,
        endOffset: i,
      });
    }
    current = "";
    rawCodes = [];
    charCodes = [];
    pendingSpace = false;
  }

  while (i < data.length) {
    const b = data[i]!;

    if (b === 0x0c) {
      // Form feed = page break.
      flushParagraph();
      pageBreakBefore.add(paragraphIndex);
      i += 1;
      paragraphStartOffset = i;
      continue;
    }

    if (b === 0x0d) {
      // Paragraph break (CR, possibly CRLF).
      flushParagraph();
      if (i + 1 < data.length && data[i + 1] === 0x0a) i += 2;
      else i += 1;
      paragraphStartOffset = i;
      continue;
    }

    if (b === 0x0a) {
      // Soft line break.
      if (current.length > 0 && !current.endsWith(" ")) appendText(" ");
      pendingSpace = false;
      i += 1;
      continue;
    }

    if (b === 0x09) {
      appendText("\t");
      pendingSpace = false;
      i += 1;
      continue;
    }

    // Direct ASCII text (Latin letters, digits, punctuation). InPage stores
    // English runs as raw bytes between tabs; keep them as-is.
    if (b >= 0x20 && b <= 0x7e && b !== 0x04) {
      if (pendingSpace && current.length > 0 && !current.endsWith(" ")) {
        appendText(" ");
      }
      pendingSpace = false;
      appendText(String.fromCharCode(b));
      i += 1;
      continue;
    }

    if ((b === 0x04 || b === 0x05 || b === 0x07) && i + 1 < data.length) {
      const cb = data[i + 1]!;

      // Composite check first (4-byte sequence).
      if (b === 0x04 && i + 3 < data.length && data[i + 2] === 0x04) {
        const mod = data[i + 3]!;
        const composite = lookupComposite(cb, mod);
        if (composite !== undefined) {
          if (pendingSpace && current.length > 0 && !current.endsWith(" ")) {
            appendText(" ");
          }
          pendingSpace = false;
          appendText(composite);
          rawCodes.push(cb, mod);
          i += 4;
          continue;
        }
      }

      const mapped = b === 0x05 ? SINDHI_CHARACTERS[cb] : lookupChar(cb, mode);
      if (mapped !== undefined) {
        if (pendingSpace && current.length > 0 && !current.endsWith(" ")) {
          appendText(" ");
        }
        pendingSpace = false;
        appendText(mapped, cb);
        rawCodes.push(cb);
        i += 2;
        continue;
      }

      // Unmapped `04 XX` — record a diagnostic and skip.
      diagnostics.push({
        severity: "warning",
        category: "encoding",
        code: "INP_UNMAPPED_CHAR",
        message: `Unmapped InPage character code 0x${cb.toString(16).toUpperCase()}`,
        offset: i,
      });
      if (current.length > 0) pendingSpace = true;
      i += 2;
      continue;
    }

    // Unknown control byte.
    if (current.length > 0) pendingSpace = true;
    i += 1;
  }

  flushParagraph();

  return { paragraphs, pageBreakBefore, diagnostics };
}
