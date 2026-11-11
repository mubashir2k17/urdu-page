import type { PageObject } from "@inpage/document-model";

const UNITS_PER_POINT = 2000;
const HEADER_LENGTH = 12;
const MAX_OBJECT_PAYLOAD = 1_000_000;
const PAYLOAD_PREFIX = 6;

interface Entry {
  key: number;
  group: number;
  value: number;
  offset: number;
  width: number;
}

// Value width is per group/key, recovered from the source records. See
// docs/reverse-engineering/drawing-records.md.
const WIDE_DRAW_KEYS = new Set([0x00, 0x01, 0x02, 0x03, 0x05, 0x1a, 0x1b, 0x1c]);

function valueWidth(group: number, key: number): number | undefined {
  if (group === 0x7e) return WIDE_DRAW_KEYS.has(key) ? 4 : 2;
  if (group === 0x03) return key === 0x08 || key === 0x06 ? 4 : 2;
  if (group === 0x05) return key >= 1 && key <= 4 ? 4 : 2;
  return undefined;
}

/** Parse the payload tag stream sequentially instead of scanning for markers. */
function parseEntries(payload: Uint8Array): Entry[] {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const hasPrefix =
    payload[0] === 0x80 && payload[1] === 0 && payload[2] === 0xff && payload[3] === 0xff &&
    payload[4] === 0xff && payload[5] === 0xff;
  const entries: Entry[] = [];
  for (let offset = hasPrefix ? PAYLOAD_PREFIX : 0; offset + 3 <= payload.length; ) {
    const key = payload[offset]!;
    const group = payload[offset + 1]!;
    const width = valueWidth(group, key);
    if (width === undefined || offset + 2 + width > payload.length) break;
    const value = width === 4 ? view.getInt32(offset + 2, true) : view.getUint16(offset + 2, true);
    entries.push({ key, group, value, offset, width });
    offset += 2 + width;
    // A polygon entry is followed by `value` bytes of vertices.
    if (group === 0x7e && key === 0x1b && value >= 0 && offset + value <= payload.length) {
      offset += value;
    }
  }
  return entries;
}

/** Decode the self-sized drawing-object records in an InPage v1 content stream. */
export function extractPageObjects(data: Uint8Array): PageObject[] {
  const objects: PageObject[] = [];

  for (let offset = 0; offset + HEADER_LENGTH <= data.length; offset++) {
    const view = new DataView(data.buffer, data.byteOffset + offset);
    const rawKind = view.getUint16(0, true);
    if (rawKind < 1 || rawKind > 6 || view.getUint32(4, true) !== 2) continue;

    const length = view.getUint32(8, true);
    if (
      length < 16 ||
      length > MAX_OBJECT_PAYLOAD ||
      offset + HEADER_LENGTH + length > data.length
    ) {
      continue;
    }

    const payload = data.subarray(offset + HEADER_LENGTH, offset + HEADER_LENGTH + length);
    const id = view.getUint16(2, true);
    const imageName = findAsciiImageName(payload);

    if (imageName !== undefined) {
      // Image records carry an extra header before the tag stream; retain the
      // scan-based extraction for those until the image header is decoded.
      const properties = readProperties(payload);
      const x = properties.get(0x00);
      const y = properties.get(0x01);
      const width = properties.get(0x02);
      const height = properties.get(0x03);
      if (x === undefined || y === undefined || width === undefined || height === undefined) {
        offset += HEADER_LENGTH + length - 1;
        continue;
      }
      const rotation = properties.get(0x1a);
      const storyReference = findStoryReference(payload);
      const columnCount = findColumnCount(payload);
      const appearance = readAppearance(payload);
      const placement = readImagePlacementScan(payload);
      if (placement) appearance.imagePlacement = placement;
      objects.push({
        kind: "image",
        id,
        bounds: {
          xPoints: x / UNITS_PER_POINT,
          yPoints: y / UNITS_PER_POINT,
          widthPoints: signedExtent(width) / UNITS_PER_POINT,
          heightPoints: signedExtent(height) / UNITS_PER_POINT,
        },
        ...(storyReference === undefined ? {} : { storyReference }),
        imageName,
        ...(columnCount === undefined ? {} : { columnCount }),
        ...(rotation === undefined ? {} : { rotationDegrees: rotation / 1000 }),
        ...appearance,
        sourceOffset: offset,
        confidence: "high",
      });
      offset += HEADER_LENGTH + length - 1;
      continue;
    }

    const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const entries = parseEntries(payload);
    const draw = new Map<number, number>();
    const story = new Map<number, number>();
    const shape = new Map<number, number>();
    let polygon: { x: number; y: number }[] | undefined;
    for (const entry of entries) {
      if (entry.group === 0x7e) {
        if (entry.key === 0x1b) {
          const bytes = entry.value;
          const start = entry.offset + 2 + entry.width;
          if (bytes >= 24 && bytes % 8 === 0 && start + bytes <= payload.length) {
            const points: { x: number; y: number }[] = [];
            for (let vertex = 0; vertex < bytes / 8; vertex++) {
              points.push({
                x: payloadView.getInt32(start + vertex * 8, true) / UNITS_PER_POINT,
                y: payloadView.getInt32(start + 4 + vertex * 8, true) / UNITS_PER_POINT,
              });
            }
            polygon = points;
          }
          continue;
        }
        draw.set(entry.key, entry.value);
      } else if (entry.group === 0x03) {
        story.set(entry.key, entry.value);
      } else {
        shape.set(entry.key, entry.value);
      }
    }

    const x = draw.get(0x00);
    const y = draw.get(0x01);
    const width = draw.get(0x02);
    const height = draw.get(0x03);
    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      continue;
    }

    const storyReference = story.get(0x08);
    const columnCount = story.get(0x05);
    const rotation = draw.get(0x1a);
    const borderStyle = draw.get(0x15);

    const result: PageObject = {
      kind: mapKind(rawKind, undefined),
      id,
      bounds: {
        xPoints: x / UNITS_PER_POINT,
        yPoints: y / UNITS_PER_POINT,
        widthPoints: signedExtent(width) / UNITS_PER_POINT,
        heightPoints: signedExtent(height) / UNITS_PER_POINT,
      },
      sourceOffset: offset,
      confidence: "high",
    };
    if (storyReference !== undefined && storyReference >= 0x100 && storyReference <= 0xffff) {
      result.storyReference = storyReference;
    }
    if (columnCount !== undefined && columnCount >= 2 && columnCount <= 16) {
      result.columnCount = columnCount;
    }
    if (rotation !== undefined) result.rotationDegrees = rotation / 1000;

    const shapeValue = shape.get(0x05);
    if (shapeValue === 0 || shapeValue === 1 || shapeValue === 6) {
      result.shape = shapeValue === 1 ? "ellipse" : shapeValue === 6 ? "polygon" : "rectangle";
    }
    const fillColorIndex = draw.get(0x0e);
    if (fillColorIndex !== undefined) result.fillColorIndex = fillColorIndex;
    if (borderStyle !== undefined) {
      result.borderStyle = borderStyle;
      result.hasBorder = borderStyle !== 0;
    }
    const borderWidth = draw.get(0x05);
    if (borderWidth !== undefined) result.borderWidth = borderWidth / UNITS_PER_POINT;
    const fillPattern = draw.get(0x19);
    if (fillPattern !== undefined) result.fillPattern = fillPattern;
    if (polygon !== undefined) result.polygon = polygon;

    objects.push(result);

    offset += HEADER_LENGTH + length - 1;
  }

  return objects;
}

function readImagePlacementScan(payload: Uint8Array): PageObject["imagePlacement"] {
  const values = new Map<number, number>();
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let p = 0; p + 6 <= payload.length; p++) {
    if (payload[p + 1] !== 5) continue;
    const key = payload[p]!;
    if (key >= 1 && key <= 4) values.set(key, view.getInt32(p + 2, true));
    if (key === 8 || key === 9) values.set(key, view.getUint16(p + 2, true));
  }
  if ([1, 2, 3, 4, 8, 9].every((key) => values.has(key)) && values.get(3)! > 0 && values.get(4)! > 0) {
    return {
      xOffset: values.get(1)! / UNITS_PER_POINT,
      yOffset: values.get(2)! / UNITS_PER_POINT,
      width: ((values.get(3)! / UNITS_PER_POINT) * values.get(8)!) / 1000,
      height: ((values.get(4)! / UNITS_PER_POINT) * values.get(9)!) / 1000,
    };
  }
  return undefined;
}

function readAppearance(payload: Uint8Array): Partial<PageObject> {
  const result: Partial<PageObject> = {};
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  for (let p = 0; p + 4 <= payload.length; p++) {
    const key = payload[p]!;
    if (payload[p + 1] === 5 && key === 5) {
      const shape = view.getUint16(p + 2, true);
      if (shape === 0 || shape === 1 || shape === 6) {
        result.shape = shape === 1 ? "ellipse" : shape === 6 ? "polygon" : "rectangle";
      }
    }
    if (payload[p + 1] !== 0x7e) continue;
    if (key === 0x0e) result.fillColorIndex = view.getUint16(p + 2, true);
    if (key === 0x15) {
      result.borderStyle = view.getUint16(p + 2, true);
      result.hasBorder = result.borderStyle !== 0;
    }
    if (key === 0x19) result.fillPattern = view.getUint16(p + 2, true);
    if (key === 5 && p + 6 <= payload.length) result.borderWidth = view.getUint32(p + 2, true) / UNITS_PER_POINT;
    if (key === 0x1b && p + 6 <= payload.length) {
      const bytes = view.getUint32(p + 2, true);
      if (bytes >= 24 && bytes % 8 === 0 && p + 6 + bytes <= payload.length) {
        result.polygon = Array.from({ length: bytes / 8 }, (_, index) => ({
          x: view.getInt32(p + 6 + index * 8, true) / UNITS_PER_POINT,
          y: view.getInt32(p + 10 + index * 8, true) / UNITS_PER_POINT,
        }));
        p += bytes + 5;
      }
    }
  }
  return result;
}

function readProperties(payload: Uint8Array): Map<number, number> {
  const properties = new Map<number, number>();
  for (let offset = 0; offset + 6 <= payload.length; offset++) {
    if (payload[offset + 1] !== 0x7e) continue;
    const value = new DataView(
      payload.buffer,
      payload.byteOffset + offset + 2,
      4,
    ).getUint32(0, true);
    properties.set(payload[offset]!, value);
  }
  return properties;
}

function findStoryReference(payload: Uint8Array): number | undefined {
  for (let offset = 0; offset + 6 <= payload.length; offset++) {
    if (payload[offset] !== 0x08 || payload[offset + 1] !== 0x03) continue;
    const reference = new DataView(
      payload.buffer,
      payload.byteOffset + offset + 2,
      4,
    ).getUint32(0, true);
    if (reference >= 0x100 && reference <= 0xffff) return reference;
  }
  return undefined;
}

function findColumnCount(payload: Uint8Array): number | undefined {
  for (let offset = 0; offset + 4 <= payload.length; offset++) {
    if (payload[offset] !== 0x05 || payload[offset + 1] !== 0x03) continue;
    const count = payload[offset + 2]! | (payload[offset + 3]! << 8);
    if (count >= 2 && count <= 16) return count;
  }
  return undefined;
}

function findAsciiImageName(payload: Uint8Array): string | undefined {
  const text = new TextDecoder("latin1").decode(payload);
  return /\*?(PPicts[0-9a-f]+)/i.exec(text)?.[1];
}

function mapKind(rawKind: number, imageName: string | undefined): PageObject["kind"] {
  if (rawKind === 1) return "page";
  if (rawKind === 3) return "text";
  if (rawKind === 4) return "line";
  if (rawKind === 5) return imageName ? "image" : "graphic";
  return "guide";
}

function signedExtent(value: number): number {
  return value > 0x7fffffff ? value - 0x1_0000_0000 : value;
}
