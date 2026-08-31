import { deflateSync } from "node:zlib";

/** Convert the uncompressed Windows DIB variants embedded by InPage to PNG. */
export function dibToPng(bytes: Uint8Array): Uint8Array {
  const isBmp = bytes[0] === 0x42 && bytes[1] === 0x4d;
  const headerOffset = isBmp ? 14 : 0;
  if (bytes.length < headerOffset + 40) throw new Error("Truncated DIB header");

  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const headerSize = view.getUint32(headerOffset, true);
  const width = view.getInt32(headerOffset + 4, true);
  const signedHeight = view.getInt32(headerOffset + 8, true);
  const bitsPerPixel = view.getUint16(headerOffset + 14, true);
  const compression = view.getUint32(headerOffset + 16, true);
  const colorsUsed = view.getUint32(headerOffset + 32, true);
  if (headerSize < 40 || width <= 0 || signedHeight === 0 || compression !== 0) {
    throw new Error("Unsupported compressed or malformed DIB");
  }
  if (![1, 4, 8, 24, 32].includes(bitsPerPixel)) {
    throw new Error(`Unsupported DIB depth ${bitsPerPixel}`);
  }

  const height = Math.abs(signedHeight);
  const topDown = signedHeight < 0;
  const paletteEntries = bitsPerPixel <= 8 ? colorsUsed || 1 << bitsPerPixel : 0;
  const paletteOffset = headerOffset + headerSize;
  const defaultPixelOffset = paletteOffset + paletteEntries * 4;
  const pixelOffset = isBmp ? view.getUint32(10, true) : defaultPixelOffset;
  const stride = Math.floor((width * bitsPerPixel + 31) / 32) * 4;
  if (pixelOffset + stride * height > bytes.length) throw new Error("Truncated DIB pixels");

  const scanlines = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const sourceY = topDown ? y : height - 1 - y;
    const sourceRow = pixelOffset + sourceY * stride;
    let target = y * (1 + width * 3);
    scanlines[target++] = 0;
    for (let x = 0; x < width; x++) {
      let red: number;
      let green: number;
      let blue: number;
      if (bitsPerPixel === 24 || bitsPerPixel === 32) {
        const pixel = sourceRow + x * (bitsPerPixel / 8);
        blue = bytes[pixel]!;
        green = bytes[pixel + 1]!;
        red = bytes[pixel + 2]!;
      } else {
        const index = paletteIndex(bytes, sourceRow, x, bitsPerPixel);
        const palette = paletteOffset + index * 4;
        blue = bytes[palette]!;
        green = bytes[palette + 1]!;
        red = bytes[palette + 2]!;
      }
      scanlines[target++] = red;
      scanlines[target++] = green;
      scanlines[target++] = blue;
    }
  }

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return concatenate([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array(deflateSync(scanlines))),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function paletteIndex(bytes: Uint8Array, row: number, x: number, depth: number): number {
  if (depth === 8) return bytes[row + x]!;
  const pixelsPerByte = 8 / depth;
  const value = bytes[row + Math.floor(x / pixelsPerByte)]!;
  const shift = 8 - depth * ((x % pixelsPerByte) + 1);
  return (value >> shift) & ((1 << depth) - 1);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatenate([typeBytes, data])));
  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
