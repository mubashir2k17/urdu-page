import type { PageSetup } from "@inpage/document-model";

const WIDTH_TAG_LOW = 0x06;
const HEIGHT_TAG_LOW = 0x07;
const LEFT_MARGIN_TAG_LOW = 0x08;
const TOP_MARGIN_TAG_LOW = 0x09;
const RIGHT_MARGIN_TAG_LOW = 0x0a;
const BOTTOM_MARGIN_TAG_LOW = 0x0b;
const PAGE_TAG_HIGH = 0x01;
const BYTES_PER_TAGGED_DIMENSION = 6;
const PAGE_SETUP_FIELD_COUNT = 6;
const PAGE_SETUP_OFFSET = 0x10e;
const PAGE_UNITS_PER_POINT = 2_000;
const MIN_PAGE_POINTS = 100;
const MAX_PAGE_POINTS = 2_000;

/**
 * Extract the v1 document page size and margins from the tagged binary preamble.
 *
 * The adjacent `0x0106` through `0x010b` fields contain unsigned 32-bit width,
 * height, and margin values in 1/2000-point units. Only the fixed header block
 * verified across the v1 fixtures is accepted; similar later blocks have
 * unknown object/style semantics.
 */
export function extractPageSetup(data: Uint8Array): PageSetup | undefined {
  const offset = PAGE_SETUP_OFFSET;
  if (data.length < offset + BYTES_PER_TAGGED_DIMENSION * PAGE_SETUP_FIELD_COUNT) {
    return undefined;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (
    data[offset] !== WIDTH_TAG_LOW ||
    data[offset + 1] !== PAGE_TAG_HIGH ||
    data[offset + 6] !== HEIGHT_TAG_LOW ||
    data[offset + 7] !== PAGE_TAG_HIGH ||
    data[offset + 12] !== LEFT_MARGIN_TAG_LOW ||
    data[offset + 13] !== PAGE_TAG_HIGH ||
    data[offset + 18] !== TOP_MARGIN_TAG_LOW ||
    data[offset + 19] !== PAGE_TAG_HIGH ||
    data[offset + 24] !== RIGHT_MARGIN_TAG_LOW ||
    data[offset + 25] !== PAGE_TAG_HIGH ||
    data[offset + 30] !== BOTTOM_MARGIN_TAG_LOW ||
    data[offset + 31] !== PAGE_TAG_HIGH
  ) {
    return undefined;
  }

  const widthPoints = view.getUint32(offset + 2, true) / PAGE_UNITS_PER_POINT;
  const heightPoints = view.getUint32(offset + 8, true) / PAGE_UNITS_PER_POINT;
  const leftPoints = view.getUint32(offset + 14, true) / PAGE_UNITS_PER_POINT;
  const topPoints = view.getUint32(offset + 20, true) / PAGE_UNITS_PER_POINT;
  const rightPoints = view.getUint32(offset + 26, true) / PAGE_UNITS_PER_POINT;
  const bottomPoints = view.getUint32(offset + 32, true) / PAGE_UNITS_PER_POINT;
  if (!isPlausibleDimension(widthPoints) || !isPlausibleDimension(heightPoints)) {
    return undefined;
  }
  if (
    !isPlausibleMargin(leftPoints, widthPoints) ||
    !isPlausibleMargin(rightPoints, widthPoints) ||
    !isPlausibleMargin(topPoints, heightPoints) ||
    !isPlausibleMargin(bottomPoints, heightPoints)
  ) {
    return undefined;
  }

  return {
    widthPoints,
    heightPoints,
    margins: {
      leftPoints,
      topPoints,
      rightPoints,
      bottomPoints,
    },
    sourceOffset: offset,
    confidence: "high",
  };
}

function isPlausibleDimension(points: number): boolean {
  return points >= MIN_PAGE_POINTS && points <= MAX_PAGE_POINTS;
}

function isPlausibleMargin(points: number, pageDimension: number): boolean {
  return points >= 0 && points < pageDimension;
}
