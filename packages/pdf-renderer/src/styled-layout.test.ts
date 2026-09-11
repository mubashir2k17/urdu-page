import {describe,expect,it,vi} from "vitest";
import type {PageObject,Story} from "@inpage/document-model";
import type {ShapedGlyph,ShapedRun} from "@inpage/text-shaper";
import type {PdfBackend} from "./backend.js";
import {drawStyledStory} from "./styled-layout.js";

describe("saved source layout",()=>{
  it.each(["Aasaar","ZoharSindhi","Noori Nastaliq"])("preserves %s character advances while fitting word spaces",arabicFontName=>{
    const draw=vi.fn<PdfBackend["drawShapedRun"]>();
    const backend:PdfBackend={addPage(){},measureShapedRun:(run,size)=>run.totalAdvance*size/run.unitsPerEm,
      drawShapedRun:draw,async drawImage(){},drawLine(){},drawRectangle(){},async save(){return new Uint8Array();}};
    const object:PageObject={id:1,kind:"text",bounds:{xPoints:10,yPoints:20,widthPoints:60,heightPoints:40},sourceOffset:0,confidence:"high"};
    const story:Story={index:0,startOffset:0,endOffset:0,paragraphs:[],cachedLayout:{frameId:1,columnWidth:60,
      contentHeight:40,columns:1,lines:[{height:40,baseline:25,width:60,runs:[{x:0,width:60,direction:"rtl",
        runs:[{kind:"text",text:"ب ت",style:{fontSize:20,arabicFontName}}]}]}]}};
    const shape=(text:string):ShapedRun=>{
      const glyphs=[...text].map((char,cluster)=>({id:1,cluster,xAdvance:char===" " && arabicFontName==="Noori Nastaliq"?0:500,yAdvance:0,xOffset:0,yOffset:0})).reverse();
      return {logicalText:text,fontId:"test",direction:"rtl",language:"ar",script:"arab",
        unitsPerEm:1000,totalAdvance:glyphs.reduce((sum,glyph)=>sum+glyph.xAdvance,0),missingGlyphCount:0,glyphs};
    };
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
  it("retains trailing spaces and separate character/space tracking in a rotated saved run",()=>{
    const draw=vi.fn<PdfBackend["drawShapedRun"]>();
    const backend:PdfBackend={addPage(){},measureShapedRun:(run,size)=>run.totalAdvance*size/run.unitsPerEm,
      drawShapedRun:draw,async drawImage(){},drawLine(){},drawRectangle(){},async save(){return new Uint8Array();}};
    const object:PageObject={id:1,kind:"text",rotationDegrees:90,bounds:{xPoints:10,yPoints:20,widthPoints:36,heightPoints:40},sourceOffset:0,confidence:"high"};
    const story:Story={index:0,startOffset:0,endOffset:0,paragraphs:[],cachedLayout:{frameId:1,columnWidth:36,
      contentHeight:40,columns:1,lines:[{height:40,baseline:25,width:36,runs:[{x:0,width:36,direction:"ltr",characterSpacing:1,extraSpace:2,
        runs:[{kind:"text",text:"A B  ",style:{fontSize:10,latinFontName:"Arial"}}]}]}]}};
    const shape=(text:string):ShapedRun=>({logicalText:text,fontId:"test",direction:"ltr",language:"en",script:"latn",
      unitsPerEm:1000,totalAdvance:500*text.length,missingGlyphCount:0,
      glyphs:[...text].map((_,cluster)=>({id:1,cluster,xAdvance:500,yAdvance:0,xOffset:0,yOffset:0}))});
    drawStyledStory(story,object,backend,shape,200);
    expect(draw.mock.calls.map(call=>call[0].logicalText).join("")).toBe("A B  ");
    const b=draw.mock.calls.find(call=>call[0].logicalText==="B")!;
    expect(b[1]).toBeCloseTo(35);
    expect(b[2]).toBeCloseTo(194);
    expect(draw.mock.calls.at(-1)![0].totalAdvance).toBe(1600);
  });
  it("distributes saved kashidas by weight in reading order after attached marks",()=>{
    const draw=vi.fn<PdfBackend["drawShapedRun"]>();
    const backend:PdfBackend={addPage(){},measureShapedRun:(run,size)=>run.totalAdvance*size/run.unitsPerEm,
      drawShapedRun:draw,async drawImage(){},drawLine(){},drawRectangle(){},async save(){return new Uint8Array();}};
    const object:PageObject={id:1,kind:"text",bounds:{xPoints:10,yPoints:20,widthPoints:15,heightPoints:40},sourceOffset:0,confidence:"high"};
    const story:Story={index:0,startOffset:0,endOffset:0,paragraphs:[],cachedLayout:{frameId:1,columnWidth:15,
      contentHeight:40,columns:1,lines:[{height:40,baseline:25,width:15,runs:[{x:0,width:15,direction:"rtl",kashidaCount:3,
        runs:[{kind:"text",text:"ب ت",style:{fontSize:10,arabicFontName:"Aasaar"}}]}]}]}};
    const shape=(text:string):ShapedRun=>{
      const glyphs:ShapedGlyph[]=[{id:text==="ب"?10:text==="ت"?20:3,cluster:0,xAdvance:text===" "?200:500,yAdvance:0,xOffset:0,yOffset:0}];
      if(text==="ب") {glyphs[0]!.xAdvance=0;glyphs.push({id:11,cluster:0,xAdvance:500,yAdvance:0,xOffset:0,yOffset:240});}
      if(text!==" ")glyphs.at(-1)!.kashida={id:90,fontId:"arabic",advance:100,weight:text==="ب"?1:3};
      return {logicalText:text,fontId:"arabic",direction:"rtl",language:"ar",script:"arab",unitsPerEm:1000,
        glyphs,totalAdvance:text===" "?200:500,missingGlyphCount:0};
    };
    drawStyledStory(story,object,backend,shape,200);
    expect(draw.mock.calls.map(call=>call[0].glyphs.map(glyph=>glyph.id))).toEqual([[20,90,90],[3],[10,11,90]]);
    expect(draw.mock.calls.at(-1)![0].logicalText).toBe("ب");
    expect(draw.mock.calls.at(-1)![0].glyphs[1]!.yOffset).toBe(240);
    expect(draw.mock.calls.reduce((sum,call)=>sum+call[0].totalAdvance,0)).toBe(1500);
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
