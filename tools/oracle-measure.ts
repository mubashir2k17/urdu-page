// Oracle measurement primitives for the runtime-initialised NOORIC advance
// table. Native InPage fills DAT_00631e78 by measuring the active NOORIC
// faces at load time; this module measures rasterised single-property oracle
// output the same way (column ink runs -> pen advances).
//
// See docs/adr/0019-native-nooric-parity-and-oracle-recovery.md.

export interface GrayImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface InkInterval {
  start: number;
  end: number;
  /** Summed ink inside the interval. */
  ink: number;
}

export interface GlyphMeasurement {
  /** Pen advances between consecutive glyph starts, in device pixels. */
  advances: number[];
  /** Ink bounding width of each detected glyph. */
  widths: number[];
  intervals: InkInterval[];
}

export interface SegmentOptions {
  /** Minimum ink (0..255) for a column to count as active. */
  threshold?: number;
  /** Columns of whitespace still treated as one glyph. */
  minGap?: number;
  /** Restrict measurement to a horizontal band. */
  yMin?: number;
  yMax?: number;
}

/** Parse a binary PGM (P5) raster, the format produced by `pdftoppm -gray`. */
export function parsePgm(bytes: Uint8Array): GrayImage {
  let offset = 0;
  const token = (): string => {
    while (offset < bytes.length) {
      const byte = bytes[offset]!;
      if (byte === 0x23) {
        while (offset < bytes.length && bytes[offset] !== 0x0a) offset++;
      } else if (byte <= 0x20) {
        offset++;
      } else break;
    }
    const start = offset;
    while (offset < bytes.length && bytes[offset]! > 0x20) offset++;
    return new TextDecoder("ascii").decode(bytes.subarray(start, offset));
  };
  if (token() !== "P5") throw new Error("Unsupported raster format (expected binary PGM P5)");
  const width = Number(token());
  const height = Number(token());
  const maximum = Number(token());
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid PGM dimensions");
  }
  if (maximum !== 255) throw new Error(`Unsupported PGM depth ${maximum}`);
  while (offset < bytes.length && bytes[offset]! <= 0x20) offset++;
  const pixels = bytes.subarray(offset);
  if (pixels.length < width * height) throw new Error("Truncated PGM payload");
  return { width, height, pixels: pixels.subarray(0, width * height) };
}

function columnInk(image: GrayImage, x: number, yMin: number, yMax: number): number {
  let ink = 0;
  for (let y = yMin; y < yMax; y++) ink += 255 - image.pixels[y * image.width + x]!;
  return ink;
}

/**
 * Segment the raster into glyph columns. Consecutive active columns are one
 * glyph; a gap no wider than `minGap` is absorbed, matching the native
 * single-glyph oracle documents where only one property varies per run.
 */
export function segmentInkColumns(image: GrayImage, options: SegmentOptions = {}): InkInterval[] {
  const threshold = options.threshold ?? 32;
  const minGap = Math.max(0, options.minGap ?? 1);
  const yMin = Math.max(0, Math.min(image.height, options.yMin ?? 0));
  const yMax = Math.max(yMin, Math.min(image.height, options.yMax ?? image.height));
  const intervals: InkInterval[] = [];
  let start = -1;
  let lastInk = 0;
  let gap = 0;
  for (let x = 0; x < image.width; x++) {
    const ink = columnInk(image, x, yMin, yMax);
    const active = ink >= threshold;
    if (active) {
      if (start < 0) start = x;
      lastInk += ink;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap > minGap) {
        intervals.push({ start, end: x - gap + 1, ink: lastInk });
        start = -1;
        lastInk = 0;
        gap = 0;
      }
    }
  }
  if (start >= 0) intervals.push({ start, end: image.width, ink: lastInk });
  return intervals;
}

/** Measure pen advances from a raster oracle image. */
export function measureGlyphAdvances(image: GrayImage, options: SegmentOptions = {}): GlyphMeasurement {
  const intervals = segmentInkColumns(image, options);
  const advances: number[] = [];
  const widths: number[] = [];
  for (const [index, interval] of intervals.entries()) {
    widths.push(interval.end - interval.start);
    if (index > 0) advances.push(interval.start - intervals[index - 1]!.start);
  }
  return { advances, widths, intervals };
}
