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
    const isPpicts = /^PPicts\d*$/i.test(stream.name);
    const format = detectImageFormat(stream.bytes);

    if (isPpicts || format !== "unknown") {
      images.push({
        name: stream.name,
        format,
        bytes: stream.bytes,
        offset: stream.offsets[0] ?? 0,
        confidence: isPpicts ? "medium" : "high",
      });
    }
  }

  return images;
}

function startsWith(data: Uint8Array, magic: number[]): boolean {
  if (data.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (data[i] !== magic[i]) return false;
  }
  return true;
}
