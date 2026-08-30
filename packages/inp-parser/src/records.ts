/**
 * InPage v1/v2 content-stream layout (verified against the supplied fixtures).
 *
 * The stream after the `0D 00 00 00 00 00` delimiter is mostly flat `04 XX`
 * content (plus `09` tabs and raw ASCII), but it may be preceded by binary
 * preambles (style blocks, font tables) and followed by non-text data (images,
 * zero fill). Some paragraphs are wrapped as `0D <len:u32 LE> <payload ending
 * in 0D>` records; the flat decoder handles the `0D` terminator as a paragraph
 * break either way.
 *
 * `findTextRegions` locates the dense-text runs by `04`-byte density, so the
 * decoder only processes real content and skips binary noise.
 *
 * FONTS.INP is a flat `04 XX` stream with no record headers; the same
 * density-based region detection applies.
 */

export const DELIMITER = [0x0d, 0x00, 0x00, 0x00, 0x00, 0x00];
export const SEPARATOR_LEN = 2048;

export interface RecordFrame {
  /** Byte offset where records begin (after separator + delimiter). */
  recordStart: number;
}

/**
 * Detect the record-framing delimiter. Returns the offset of the delimiter, or
 * -1 if not found. Searches from `start` to the end of the stream.
 */
export function findDelimiter(data: Uint8Array, start = 0): number {
  outer: for (let i = start; i <= data.length - DELIMITER.length; i++) {
    for (let j = 0; j < DELIMITER.length; j++) {
      if (data[i + j] !== DELIMITER[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export interface ParsedRecord {
  length: number;
  payload: Uint8Array;
  /** Offset of the payload start. */
  offset: number;
  kind: "skip" | "end" | "record";
}

/** Upper bound on a single record payload, to reject corrupt lengths. */
const MAX_RECORD_LENGTH = 100_000;

/**
 * Walk `0D <len:u32 LE> <payload ending in 0D>` records starting at `start`.
 * Returns parsed records plus the offset where the walk stopped (end of
 * stream). Invalid patterns are skipped, so the walker tolerates binary
 * preambles and non-record regions between records.
 */
export function walkRecords(
  data: Uint8Array,
  start: number,
): { records: ParsedRecord[]; consumed: number } {
  const records: ParsedRecord[] = [];
  let pos = start;

  while (pos + 5 <= data.length) {
    // A valid record: `0D <len:u32 LE>` with payload ending in `0D`.
    if (data[pos] === 0x0d) {
      const len =
        data[pos + 1]! |
        (data[pos + 2]! << 8) |
        (data[pos + 3]! << 16) |
        (data[pos + 4]! << 24);
      if (len > 0 && len <= MAX_RECORD_LENGTH && pos + 5 + len <= data.length) {
        const payload = data.subarray(pos + 5, pos + 5 + len);
        if (payload[payload.length - 1] === 0x0d) {
          records.push({ length: len, payload, offset: pos + 5, kind: "record" });
          pos += 5 + len;
          continue;
        }
      }
      pos += 5;
      continue;
    }
    pos += 1;
  }

  return { records, consumed: pos };
}

/**
 * Determine if the stream uses record framing. Returns the record start offset
 * (after separator + delimiter) or null if framing is absent.
 */
export function detectRecordFraming(data: Uint8Array): number | null {
  const delim = findDelimiter(data);
  if (delim < 0) return null;
  return delim + DELIMITER.length;
}

export interface TextRegion {
  start: number;
  end: number;
}

const TEXT_WINDOW_SIZE = 512;
const TEXT_DENSITY_THRESHOLD = 0.06;
const TEXT_MIN_REGION_LENGTH = 1024;

/**
 * Locate the run(s) of real InPage content in a content stream.
 *
 * Real text has a high density of `04 XX` pairs; binary preambles (font
 * tables, color tables, style blocks) and trailing data (images, zero fill)
 * have a low `04` density. Windows with density above the threshold are merged
 * into contiguous regions, and short regions are discarded.
 */
export function findTextRegions(
  data: Uint8Array,
  start: number,
): TextRegion[] {
  const windows: { start: number; end: number; density: number }[] = [];
  for (let w = start; w < data.length; w += TEXT_WINDOW_SIZE) {
    const end = Math.min(w + TEXT_WINDOW_SIZE, data.length);
    let four = 0;
    for (let i = w; i < end; i++) if (data[i] === 0x04) four++;
    windows.push({ start: w, end, density: four / (end - w) });
  }

  const regions: TextRegion[] = [];
  let current: TextRegion | null = null;
  for (const win of windows) {
    const isText = win.density >= TEXT_DENSITY_THRESHOLD;
    if (isText && current === null) {
      current = { start: win.start, end: win.end };
    } else if (isText && current !== null) {
      current.end = win.end;
    } else if (!isText && current !== null) {
      regions.push(current);
      current = null;
    }
  }
  if (current) regions.push(current);

  return regions.filter((r) => r.end - r.start >= TEXT_MIN_REGION_LENGTH);
}
