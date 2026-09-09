import type { PageObject } from "@inpage/document-model";

const UNITS_PER_POINT = 2000;
const HEADER_LENGTH = 12;
const MAX_OBJECT_PAYLOAD = 1_000_000;

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
    const properties = readProperties(payload);
    const x = properties.get(0x00);
    const y = properties.get(0x01);
    const width = properties.get(0x02);
    const height = properties.get(0x03);
    if (x === undefined || y === undefined || width === undefined || height === undefined) {
      continue;
    }

    const imageName = findAsciiImageName(payload);
    const storyReference = findStoryReference(payload);
    const rotation = properties.get(0x1a);
    const columnCount = findColumnCount(payload);
    const appearance = readAppearance(payload);
    if(imageName) {
      const imageValues=new Map<number,number>();
      const imageView=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
      for(let p=0;p+6<=payload.length;p++) {
        if(payload[p+1]!==5)continue;
        const key=payload[p]!;
        if([1,2,3,4].includes(key))imageValues.set(key,imageView.getInt32(p+2,true));
        if(key===8 || key===9)imageValues.set(key,imageView.getUint16(p+2,true));
      }
      if([1,2,3,4,8,9].every(key=>imageValues.has(key)) && imageValues.get(3)!>0 && imageValues.get(4)!>0) {
        appearance.imagePlacement={xOffset:imageValues.get(1)!/2000,yOffset:imageValues.get(2)!/2000,
          width:imageValues.get(3)!/2000*imageValues.get(8)!/1000,
          height:imageValues.get(4)!/2000*imageValues.get(9)!/1000};
      }
    }
    objects.push({
      kind: mapKind(rawKind, imageName),
      id: view.getUint16(2, true),
      bounds: {
        xPoints: x / UNITS_PER_POINT,
        yPoints: y / UNITS_PER_POINT,
        widthPoints: signedExtent(width) / UNITS_PER_POINT,
        heightPoints: signedExtent(height) / UNITS_PER_POINT,
      },
      ...(storyReference === undefined ? {} : { storyReference }),
      ...(imageName === undefined ? {} : { imageName }),
      ...(columnCount === undefined ? {} : { columnCount }),
      ...(rotation === undefined ? {} : { rotationDegrees: rotation / 1000 }),
      ...appearance,
      sourceOffset: offset,
      confidence: "high",
    });

    offset += HEADER_LENGTH + length - 1;
  }

  return objects;
}

function readAppearance(payload: Uint8Array): Partial<PageObject> {
  const result: Partial<PageObject> = {};
  const view = new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
  for (let p = 0; p + 4 <= payload.length; p++) {
    const key = payload[p];
    if (payload[p+1] === 5 && key === 5) {
      const shape = view.getUint16(p+2,true);
      if (shape === 0 || shape === 1 || shape === 6) result.shape = shape === 1 ? "ellipse" : shape === 6 ? "polygon" : "rectangle";
    }
    if (payload[p+1] !== 0x7e) continue;
    if (key === 0x0e) result.fillColorIndex = view.getUint16(p+2,true);
    if (key === 0x15) {
      result.borderStyle = view.getUint16(p+2,true);
      result.hasBorder = result.borderStyle !== 0;
    }
    if (key === 0x19) result.fillPattern = view.getUint16(p+2,true);
    if (key === 5 && p+6 <= payload.length) result.borderWidth = view.getUint32(p+2,true)/UNITS_PER_POINT;
    if (key === 0x1b && p+6 <= payload.length) {
      const bytes = view.getUint32(p+2,true);
      if (bytes >= 24 && bytes % 8 === 0 && p+6+bytes <= payload.length) {
        result.polygon = Array.from({length:bytes/8},(_,i) => ({
          x:view.getInt32(p+6+i*8,true)/UNITS_PER_POINT,
          y:view.getInt32(p+10+i*8,true)/UNITS_PER_POINT,
        }));
        p += bytes+5;
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
