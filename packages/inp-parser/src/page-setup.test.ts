import { describe, expect, it } from "vitest";

import { extractPageSetup } from "./page-setup.js";

const PAGE_SETUP_OFFSET = 0x10e;

describe("v1 page setup", () => {
  it("decodes the fixed header block in 1/2000-point units", () => {
    const data = new Uint8Array(0x132);
    writePageSetup(data, PAGE_SETUP_OFFSET);

    expect(extractPageSetup(data)).toEqual({
      widthPoints: 612,
      heightPoints: 792,
      margins: {
        leftPoints: 162,
        topPoints: 54,
        rightPoints: 162,
        bottomPoints: 216,
      },
      sourceOffset: PAGE_SETUP_OFFSET,
      confidence: "high",
    });
  });

  it("does not treat matching tags outside the fixed header as page setup", () => {
    const data = new Uint8Array(0x132);
    writePageSetup(data, 0);

    expect(extractPageSetup(data)).toBeUndefined();
  });
});

function writePageSetup(data: Uint8Array, offset: number): void {
  const values = [612, 792, 162, 54, 162, 216];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  values.forEach((points, index) => {
    const fieldOffset = offset + index * 6;
    data[fieldOffset] = 0x06 + index;
    data[fieldOffset + 1] = 0x01;
    view.setUint32(fieldOffset + 2, points * 2_000, true);
  });
}
