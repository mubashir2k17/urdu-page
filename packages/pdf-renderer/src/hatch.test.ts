import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {PDFDict,PDFDocument,PDFName,PDFRawStream} from "pdf-lib";
import {PdfLibBackend} from "./pdflib-backend.js";

describe("diagonal fill brush",()=>{
  it("uses a page-anchored tiling pattern for independently positioned frames",async()=>{
    const backend=await PdfLibBackend.create();
    await backend.setFont(readFileSync(new URL("../../../fonts/NotoNastaliqUrdu-Regular.ttf",import.meta.url)));
    backend.addPage(500,600);
    for(const x of [20,250])backend.drawGraphic({id:x,kind:"graphic",sourceOffset:0,confidence:"high",
      bounds:{xPoints:x,yPoints:40,widthPoints:100,heightPoints:70},fillColorIndex:1,fillPattern:3},600);
    const pdf=await PDFDocument.load(await backend.save());
    const patterns=pdf.getPage(0).node.Resources()!.lookup(PDFName.of("Pattern"),PDFDict);
    expect(patterns.keys().length).toBe(2);
    for(const key of patterns.keys()) {
      const stream=pdf.context.lookup(patterns.get(key));
      if(!(stream instanceof PDFRawStream))throw Error("Expected pattern stream");
      const pattern=stream.dict;
      expect(pattern.get(PDFName.of("Matrix"))!.toString()).toBe("[ 0.75 0 0 -0.75 0 600 ]");
      expect(pattern.get(PDFName.of("TilingType"))!.toString()).toBe("2");
    }
  });
});
