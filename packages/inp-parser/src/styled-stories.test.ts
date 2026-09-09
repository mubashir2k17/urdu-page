import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCfb } from "@inpage/cfb";
import { decodeStyledStories } from "./styled-stories.js";

const data = readCfb(readFileSync(new URL("../../../tests/SAMPLE2.INP", import.meta.url))).byPath.get("InPage100")!.bytes;

describe("bounded v1 typography", () => {
  it("pairs complete text and style tables without treating length prefixes or font-table bytes as text", () => {
    const decoded = decodeStyledStories(data, "urdu")!;
    expect(decoded.stories).toHaveLength(30);
    expect(decoded.stories[0]!.paragraphs.flatMap(p => p.runs).map(r => r.text).join("")).toBe("←");
    expect(decoded.stories[1]!.paragraphs[0]!.runs[0]!.text).toBe("Text rotation and outline style");
    expect(decoded.stories[1]!.paragraphs[0]!.runs[0]!.style).toMatchObject({fontSize:10, lineHeight:12, bold:true, latinFontName:"Arial", alignment:"center"});
    expect(decoded.stories[2]!.paragraphs[0]!.runs[0]!.style).toMatchObject({fontSize:55, lineHeight:75, outline:true});
    expect(decoded.stories[22]!.paragraphs[0]!.runs[0]!.style).toMatchObject({fontSize:12, lineHeight:18, arabicFontName:"Aasaar",paragraphBefore:7.2,paragraphAfter:7.2});
    expect(decoded.stories[27]!.paragraphs[0]!.runs[0]!.style).toMatchObject({fontSize:10, alignment:"right"});
    expect(decoded.stories[29]!.paragraphs[0]!.runs[0]!.text).toMatch(/^This page/);
    const headingRuns=decoded.stories[21]!.paragraphs[0]!.runs;
    expect(headingRuns.find(run=>run.text==="سے")!.style).toMatchObject({baselineShift:-12,trackingEm:-1.02});
    expect(decoded.stories[24]!.paragraphs[1]!.runs[0]!.style!.tabStops).toEqual([
      {position:48,alignment:0},{position:108.75,alignment:0},{position:189.75,alignment:0},
      {position:264.75,alignment:0},{position:341.25,alignment:3},{position:446.25,alignment:1},
    ]);
  });

  it("validates saved source line coverage and expands the nested poetry cells",()=>{
    const decoded=decodeStyledStories(data,"urdu")!;
    const heading=decoded.stories[21]!.cachedLayout!;
    expect(heading.frameId).toBe(38);
    expect(heading.lines).toHaveLength(1);
    expect(heading.lines[0]).toMatchObject({baseline:48,height:64,width:440.459});
    const poem=decoded.stories[26]!.cachedLayout!;
    expect(poem.frameId).toBe(48);
    expect(poem.columnWidth).toBe(176);
    const firstVerse=poem.lines[1]!.runs;
    expect(firstVerse.some(run=>run.x>90 && run.runs.some(part=>part.text.includes("نوجوان")))).toBe(true);
    expect(firstVerse.some(run=>run.x<90 && run.runs.some(part=>part.text.includes("مایوس")))).toBe(true);
    const corrupt=data.slice();
    corrupt[27411]=3; // Saved lines must cover exactly the source payload, including paragraph endings.
    expect(decodeStyledStories(corrupt,"urdu")!.stories.every(story=>!story.cachedLayout)).toBe(true);
  });

  it("rejects truncated or mismatched tables", () => {
    expect(decodeStyledStories(data.subarray(0, 14700), "urdu")).toBeUndefined();
    const damaged = data.slice();
    damaged[14687] = 3; // First style covers two source bytes, not three.
    expect(decodeStyledStories(damaged, "urdu")).toBeUndefined();
  });
});
