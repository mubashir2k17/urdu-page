import {describe,expect,it,vi} from "vitest";
import type {PageObject,Story} from "@inpage/document-model";
import type {ShapedRun} from "@inpage/text-shaper";
import type {PdfBackend} from "./backend.js";
import {drawStyledStory} from "./styled-layout.js";

describe("saved source layout",()=>{
  it.each(["Aasaar","ZoharSindhi"])("preserves %s character advances while fitting word spaces",arabicFontName=>{
    const draw=vi.fn<PdfBackend["drawShapedRun"]>();
    const backend:PdfBackend={addPage(){},measureShapedRun:(run,size)=>run.totalAdvance*size/run.unitsPerEm,
      drawShapedRun:draw,async drawImage(){},drawLine(){},drawRectangle(){},async save(){return new Uint8Array();}};
    const object:PageObject={id:1,kind:"text",bounds:{xPoints:10,yPoints:20,widthPoints:60,heightPoints:40},sourceOffset:0,confidence:"high"};
    const story:Story={index:0,startOffset:0,endOffset:0,paragraphs:[],cachedLayout:{frameId:1,columnWidth:60,
      contentHeight:40,columns:1,lines:[{height:40,baseline:25,width:60,runs:[{x:0,width:60,direction:"rtl",
        runs:[{kind:"text",text:"ب ت",style:{fontSize:20,arabicFontName}}]}]}]}};
    const shape=(text:string):ShapedRun=>({logicalText:text,fontId:"test",direction:"rtl",language:"ar",script:"arab",
      unitsPerEm:1000,totalAdvance:500,missingGlyphCount:0,
      glyphs:[{id:1,cluster:0,xAdvance:500,yAdvance:0,xOffset:0,yOffset:0}]});
    drawStyledStory(story,object,backend,shape,200);
    expect(draw.mock.calls.find(call=>call[0].logicalText==="ب")![1]).toBe(60);
    expect(draw.mock.calls.filter(call=>call[0].logicalText.trim()).map(call=>call[0].totalAdvance)).toEqual([500,500]);
  });
  it("keeps Latin letter spacing distinct from Noori word-space fitting",()=>{
    const draw=vi.fn<PdfBackend["drawShapedRun"]>();
    const backend:PdfBackend={addPage(){},measureShapedRun:(run,size)=>run.totalAdvance*size/run.unitsPerEm,
      drawShapedRun:draw,async drawImage(){},drawLine(){},drawRectangle(){},async save(){return new Uint8Array();}};
    const object:PageObject={id:1,kind:"text",bounds:{xPoints:10,yPoints:20,widthPoints:60,heightPoints:40},sourceOffset:0,confidence:"high"};
    const story:Story={index:0,startOffset:0,endOffset:0,paragraphs:[],cachedLayout:{frameId:1,columnWidth:60,
      contentHeight:40,columns:1,lines:[{height:40,baseline:25,width:60,runs:[{x:0,width:60,direction:"ltr",
        runs:[{kind:"text",text:"A B",style:{fontSize:20,latinFontName:"Arial",arabicFontName:"Noori Nastaliq"}}]}]}]}};
    const shape=(text:string):ShapedRun=>({logicalText:text,fontId:"test",direction:"ltr",language:"en",script:"latn",
      unitsPerEm:1000,totalAdvance:500*text.length,missingGlyphCount:0,
      glyphs:[...text].map((_,cluster)=>({id:1,cluster,xAdvance:500,yAdvance:0,xOffset:0,yOffset:0}))});
    drawStyledStory(story,object,backend,shape,200);
    expect(draw.mock.calls.find(call=>call[0].logicalText==="B")![1]).toBe(50);
  });
  it("draws overlapping runs even when tracking gives them zero or negative advance",()=>{
    const draw=vi.fn<PdfBackend["drawShapedRun"]>();
    const backend:PdfBackend={addPage(){},measureShapedRun:(run,size)=>run.totalAdvance*size/run.unitsPerEm,
      drawShapedRun:draw,async drawImage(){},drawLine(){},drawRectangle(){},async save(){return new Uint8Array();}};
    const object:PageObject={id:1,kind:"text",bounds:{xPoints:10,yPoints:20,widthPoints:100,heightPoints:40},
      sourceOffset:0,confidence:"high"};
    const story:Story={index:0,startOffset:0,endOffset:0,paragraphs:[],cachedLayout:{frameId:1,columnWidth:100,
      contentHeight:40,columns:1,lines:[{height:40,baseline:25,width:100,runs:[
        {x:30,width:-1,direction:"rtl",runs:[{kind:"text",text:"ہ",style:{fontSize:20,baselineShift:-8}}]},
        {x:45,width:0,direction:"rtl",runs:[{kind:"text",text:"سے",style:{fontSize:20,baselineShift:-12}}]},
      ]}]}};
    const shape=(text:string):ShapedRun=>({logicalText:text,fontId:"test",direction:"rtl",language:"ur",script:"arab",
      unitsPerEm:1000,totalAdvance:500,missingGlyphCount:0,
      glyphs:[{id:1,cluster:0,xAdvance:500,yAdvance:0,xOffset:0,yOffset:0}]});
    drawStyledStory(story,object,backend,shape,200);
    expect(draw.mock.calls.map(call=>[call[0].logicalText,call[1],call[2]]))
      .toEqual([["ہ",40,163],["سے",55,167]]);
  });
});
