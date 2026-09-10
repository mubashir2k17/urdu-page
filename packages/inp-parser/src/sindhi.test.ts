import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {decodeLegacy} from "./legacy-decode.js";
import {openInPage} from "./index.js";

describe("Sindhi character set",()=>{
  it("uses its own alphabet and consumes prefixed spaces and punctuation",()=>{
    const bytes=Uint8Array.from([5,0x81,5,0x9b,5,0x81,5,0xb0,5,0x20,5,0x8a,5,0x81,5,0xb1,5,0xc2,13,4,0x9b]);
    const decoded=decodeLegacy(bytes);
    expect(decoded.paragraphs.map(p=>p.runs.map(r=>r.text).join(""))).toEqual(["اسان پاڻ.","ق"]);
    expect(decoded.diagnostics).toEqual([]);
  });
  it("retains the switch to Urdu inside the specimen paragraph and cached line",()=>{
    const doc=openInPage(readFileSync(new URL("../../../tests/SAMPLE2.INP",import.meta.url)));
    const story=doc.stories.find(s=>s.paragraphs.some(p=>p.runs.some(r=>r.text.includes("اسان"))))!;
    const runs=story.paragraphs.flatMap(p=>p.runs);
    expect(runs.find(r=>r.text.includes("اسان"))?.style?.arabicFontName).toBe("ZoharSindhi");
    expect(runs.find(r=>r.text.includes("سندھی"))?.style?.arabicFontName).toBe("Noori Nastaliq");
    expect(story.cachedLayout?.lines.flatMap(l=>l.runs).flatMap(r=>r.runs).some(r=>r.text.includes("اسان"))).toBe(true);
  });
});
