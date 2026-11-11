import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {InPageDocument,Story} from "@inpage/document-model";
import type {ShapeInput,ShapedRun} from "@inpage/text-shaper";
import {renderPdf} from "./render.js";

const fontBytes=readFileSync(new URL("../../../fonts/NotoNastaliqUrdu-Regular.ttf",import.meta.url));

describe("legacy-code shaping cache",()=>{
  it("does not reuse a text-only cache entry for different aligned codes",async()=>{
    const textRun=(code:number):Story["paragraphs"][number]["runs"][number]=>({
      kind:"text",text:"ب",charCodes:[code],legacyRunKind:0x7f8b,
      style:{fontSize:12,arabicFontName:"Trad Arabic"},
    });
    const story:Story={index:0,startOffset:0,endOffset:0,
      paragraphs:[{index:0,startOffset:0,endOffset:0,runs:[textRun(0x82)]}],cachedLayout:{
      frameId:1,columnWidth:100,contentHeight:40,columns:1,lines:[{height:40,baseline:20,width:100,runs:[
        {x:0,width:40,direction:"rtl",runs:[textRun(0x82)]},
        {x:50,width:40,direction:"rtl",runs:[textRun(0x81)]},
      ]}],
    }};
    const document:InPageDocument={version:1,sourceStreams:[],metadata:{confidence:"low"},fonts:[],colors:[],pages:[],paragraphs:[],
      stories:[story],pageObjects:[{id:1,kind:"text",storyReference:0,sourceOffset:0,confidence:"high",
        bounds:{xPoints:0,yPoints:0,widthPoints:100,heightPoints:40}}],images:[],unknownRecords:[],diagnostics:[],sourceSize:0};
    const inputs:ShapeInput[]=[];
    await renderPdf(document,{preservePageSize:false,preserveLayout:true,embedFonts:true,searchableText:true},
      {getBytes:async()=>fontBytes},{fonts:[],shaper:{shape(input):ShapedRun {
        inputs.push(input);
        return {logicalText:input.text,fontId:input.font.id,direction:input.direction,language:input.language,script:input.script,
          unitsPerEm:1000,legacyCodeShaped:true,totalAdvance:500,missingGlyphCount:0,
          glyphs:[{id:1,cluster:0,xAdvance:500,yAdvance:0,xOffset:0,yOffset:0}]};
      }}});
    expect(inputs).toHaveLength(2);
    expect(inputs.map(input=>input.codes)).toEqual([[0x82],[0x81]]);
  });
});
