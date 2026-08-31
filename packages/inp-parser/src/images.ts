import type { EmbeddedImage } from "@inpage/document-model";
import type { CfbStream } from "@inpage/cfb";

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// DIB/BMP: "BM" header, or a BITMAPINFOHEADER (40-byte) followed by pixel data.
const BMP_MAGIC = [0x42, 0x4d];

export function detectImageFormat(bytes: Uint8Array): EmbeddedImage["format"] {
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg";
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  if (startsWith(bytes, BMP_MAGIC)) return "dib";
  if (readDibDimensions(bytes)) return "dib";
  return "unknown";
}

/**
 * Enumerate streams that look like embedded images or page previews.
 * `PPicts*` streams are retained even when their format is unknown, so they can
 * be decoded later.
 */
export function extractImages(
  streams: CfbStream[],
): EmbeddedImage[] {
  const images: EmbeddedImage[] = [];

  for (const stream of streams) {
    const isPpicts = /^PPicts[0-9a-f]*$/i.test(stream.name);
    const format = detectImageFormat(stream.bytes);

    if (isPpicts || format !== "unknown") {
      const dimensions = format === "dib" ? readDibDimensions(stream.bytes) : undefined;
      images.push({
        name: stream.name,
        format,
        bytes: stream.bytes,
        offset: stream.offsets[0] ?? 0,
        ...(dimensions ?? {}),
        confidence: isPpicts ? "medium" : "high",
      });
    }
  }

  return images;
}

function readDibDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  const headerOffset = startsWith(bytes, BMP_MAGIC) ? 14 : 0;
  if (bytes.length < headerOffset + 40) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset + headerOffset);
  const headerSize = view.getUint32(0, true);
  const width = view.getInt32(4, true);
  const height = view.getInt32(8, true);
  const planes = view.getUint16(12, true);
  const bitsPerPixel = view.getUint16(14, true);
  const compression = view.getUint32(16, true);
  if (
    headerSize < 40 ||
    headerSize > bytes.length - headerOffset ||
    width <= 0 ||
    height === 0 ||
    planes !== 1 ||
    ![1, 4, 8, 16, 24, 32].includes(bitsPerPixel) ||
    compression > 3
  ) {
    return undefined;
  }
  return { width, height: Math.abs(height) };
}

function startsWith(data: Uint8Array, magic: number[]): boolean {
  if (data.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (data[i] !== magic[i]) return false;
  }
  return true;
}
