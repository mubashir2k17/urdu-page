import {describe,expect,it} from "vitest";
import {decodeLegacy} from "./legacy-decode.js";

describe("native advancing Arabic roots",()=>{
  it("decodes Alef variants as letters rather than marks or missing text",()=>{
    const data=Uint8Array.from([4,0xc8,4,0x20,4,0xc9,4,0x20,4,0xca,4,0x20,4,0xb6,4,0xb7,4,0xb8]);
    expect(decodeLegacy(data).paragraphs.flatMap(p=>p.runs).map(r=>r.text).join(""))
      .toBe("آ أ إ ؤئي");
  });
});
