import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {readCfb} from "@inpage/cfb";
import {extractPageObjects} from "./page-objects.js";

describe("source drawing appearance",()=>{
  it("retains transparent frames, filled panels and the source polygon vertices",()=>{
    const data=readCfb(readFileSync(new URL("../../../tests/SAMPLE2.INP",import.meta.url))).byPath.get("InPage100")!.bytes;
    const objects=extractPageObjects(data);
    expect(objects.find(object=>object.id===43)).toMatchObject({fillColorIndex:0,hasBorder:false});
    expect(objects.find(object=>object.id===18)).toMatchObject({fillColorIndex:3,borderWidth:1,hasBorder:true});
    expect(objects.find(object=>object.id===34)).toMatchObject({shape:"polygon",fillColorIndex:2,
      polygon:[{x:36,y:36},{x:311.959,y:36},{x:50.959,y:51.384},{x:36,y:132.384}]});
    expect(objects.find(object=>object.id===37)).toMatchObject({shape:"ellipse",borderStyle:15,borderWidth:3});
  });
});
