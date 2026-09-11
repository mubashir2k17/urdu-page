import type { PageObject, Story, TextStyle } from "@inpage/document-model";
import type { ShapedRun } from "@inpage/text-shaper";
import type { PdfBackend } from "./backend.js";

type Direction = "ltr" | "rtl";
type Shape = (text: string, direction: Direction, style?: TextStyle) => ShapedRun;
interface Token {text: string; style: TextStyle; run: ShapedRun; width: number; direction: Direction;
  pieces: {run:ShapedRun;style:TextStyle}[]}

/** Lay out source-sized runs; unavailable styles retain the existing fallback shaper. */
export function drawStyledStory(story: Story, object: PageObject, backend: PdfBackend, shape: Shape, pageHeight: number,
  saved?:{baseline:number;characterSpacing?:number;extraSpace?:number}): void {
  if(story.cachedLayout && story.cachedLayout.frameId===object.id && !saved) {
    const cache=story.cachedLayout;
    const insetX=cache.columns===1?Math.max(0,(object.bounds.widthPoints-cache.columnWidth)/2):0;
    const insetY=Math.max(0,(object.bounds.heightPoints-cache.contentHeight)/2);
    const gap=cache.columns>1?(object.bounds.widthPoints-cache.columnWidth*cache.columns)/(cache.columns-1):0;
    const angle=(object.rotationDegrees ?? 0)*Math.PI/180;
    let column=0,top=0;
    for(const line of cache.lines) {
      if(top+line.height>cache.contentHeight+0.01 && top>0 && cache.columns>1){column++;top=0;}
      if(column>=cache.columns)break;
      const columnX=(cache.columns-1-column)*(cache.columnWidth+gap)+insetX;
      for(const run of line.runs) {
        if(!run.runs.length)continue;
        const localX=columnX+run.x,localTop=top+insetY;
        const group:Story={index:story.index,startOffset:0,endOffset:0,
          paragraphs:[{index:0,startOffset:0,endOffset:0,runs:run.runs}]};
        const frame:PageObject={...object,columnCount:1,bounds:{
          xPoints:object.bounds.xPoints+localX*Math.cos(angle)+localTop*Math.sin(angle),
          yPoints:object.bounds.yPoints-localX*Math.sin(angle)+localTop*Math.cos(angle),
          widthPoints:run.width,heightPoints:line.height}};
        const before=line.paragraphStart ? run.runs[0]?.style?.paragraphBefore ?? 0 : 0;
        drawStyledStory(group,frame,backend,shape,pageHeight,{baseline:(run.baseline ?? line.baseline)+before,characterSpacing:run.characterSpacing ?? 0,extraSpace:run.extraSpace ?? 0});
      }
      top+=line.height;
    }
    return;
  }
  const hasSavedSpacing=!!(saved && (saved.characterSpacing || saved.extraSpace));
  const {xPoints:x, yPoints:top, widthPoints:width, heightPoints:height} = object.bounds;
  const columns = object.columnCount ?? 1;
  const gap = columns > 1 ? 9 : 0;
  const columnWidth = (width - gap * (columns - 1)) / columns;
  const rotation = object.rotationDegrees ?? 0;
  const radians = rotation * Math.PI / 180;
  let column = 0;
  let usedHeight = 0;
  for (const paragraph of story.paragraphs) {
    const baseStyle = paragraph.runs.find(run => run.style)?.style ?? {fontSize:12};
    if(!saved)usedHeight+=baseStyle.paragraphBefore ?? 0;
    if (baseStyle.tabStops?.length && paragraph.runs.some(run=>run.text.includes("\t"))) {
      const cells:{text:string;style:TextStyle}[][] = [[]];
      for (const source of paragraph.runs) {
        const parts=source.text.split("\t");
        parts.forEach((text,index)=>{
          if(index)cells.push([]);
          if(text)cells.at(-1)!.push({text,style:source.style ?? baseStyle});
        });
      }
      let distance=0,alignment=0;
      const stops=[...baseStyle.tabStops].sort((a,b)=>a.position-b.position);
      for (const [cellIndex,cell] of cells.entries()) {
        const content=cell.map(part=>part.text).join("").trim();
        const style=cell[0]?.style ?? baseStyle;
        const direction:Direction=/[\u0600-\u06ff]/.test(content)?"rtl":"ltr";
        const run=shape(content,direction,style);
        const cellWidth=backend.measureShapedRun(run,style.fontSize);
        const anchor=width-distance;
        let localX=anchor-cellWidth;
        if(alignment===1)localX=anchor;
        if(alignment===3 && content.includes(".")) {
          localX=anchor-backend.measureShapedRun(shape(content.split(".")[0]!,direction,style),style.fontSize);
        }
        backend.drawShapedRun(run,x+localX,pageHeight-top-usedHeight-style.fontSize,style.fontSize,rotation,style);
        const next=stops.find(stop=>stop.position>distance+cellWidth+0.01);
        distance=next?.position ?? distance+cellWidth+36;
        alignment=next?.alignment ?? 0;
      }
      usedHeight += baseStyle.lineHeight ?? baseStyle.fontSize;
      continue;
    }
    const baseDirection: Direction = paragraph.runs.some(run => /[\u0600-\u06ff]/.test(run.text)) ? "rtl" : "ltr";
    const tokens: Token[] = [];
    const sources: {text:string;style:TextStyle;scalarStyles:TextStyle[]}[] = [];
    for (const source of paragraph.runs) {
      const style = source.style ?? baseStyle;
      const previous = sources.at(-1);
      const shapeKey = (style:TextStyle) => JSON.stringify({...style,baselineShift:0,trackingEm:0,trackingPoints:0});
      if (previous && shapeKey(previous.style) === shapeKey(style)) {
        previous.text += source.text;
        previous.scalarStyles.push(...[...source.text].map(() => style));
      } else sources.push({text:source.text,style,scalarStyles:[...source.text].map(() => style)});
    }
    for (const source of sources) {
      const style = source.style ?? baseStyle;
      const shared = /[\u0600-\u06ff]/.test(source.text) && style.arabicFontName === "Noori Nastaliq"
        ? shape(source.text, "rtl", style) : undefined;
      let scalarOffset = 0;
      for (const text of source.text.match(/\s+|[^\s]+/g) ?? []) {
        const direction: Direction = /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr";
        const end = scalarOffset + [...text].length;
        const glyphs = shared?.glyphs.filter(glyph => glyph.cluster >= scalarOffset && glyph.cluster < end)
          .map(glyph => ({...glyph,cluster:glyph.cluster-scalarOffset}));
        const run = shared && glyphs ? {...shared, logicalText:text,glyphs,
          totalAdvance:glyphs.reduce((sum,glyph) => sum+glyph.xAdvance,0)} : shape(text, direction, style);
        const pieces: Token["pieces"] = [];
        for (const originalGlyph of run.glyphs) {
          const glyph = {...originalGlyph};
          const glyphStyle = source.scalarStyles[scalarOffset + glyph.cluster] ?? style;
          if (glyph.xAdvance && /\S/.test(text)) {
            glyph.xAdvance += ((glyphStyle.trackingEm ?? 0) + (glyphStyle.trackingPoints ?? 0) / style.fontSize) * run.unitsPerEm;
          }
          let piece = pieces.at(-1);
          if (!piece || piece.style.baselineShift !== glyphStyle.baselineShift) {
            piece = {style:glyphStyle,run:{...run,logicalText:pieces.length ? "" : text,glyphs:[],totalAdvance:0}};
            pieces.push(piece);
          }
          piece.run.glyphs.push(glyph);
          piece.run.totalAdvance += glyph.xAdvance;
        }
        scalarOffset = end;
        tokens.push({text, style, direction, run, pieces,
          width:pieces.reduce((sum,piece) => sum+backend.measureShapedRun(piece.run,style.fontSize)*(style.horizontalScale ?? 1),0)});
      }
    }
    if (!tokens.length) { usedHeight += baseStyle.lineHeight ?? baseStyle.fontSize; continue; }
    const lines: Token[][] = [];
    let line: Token[] = [];
    let lineWidth = 0;
    for (const token of tokens) {
      if (!saved && !/^\s+$/.test(token.text) && lineWidth + token.width > columnWidth && line.some(item => /\S/.test(item.text))) {
        while (line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop();
        lines.push(line); line = []; lineWidth = 0;
      }
      if (!hasSavedSpacing && !line.length && /^\s+$/.test(token.text)) continue;
      line.push(token); lineWidth += token.width;
    }
    while (!hasSavedSpacing && line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop();
    if (line.length) lines.push(line);
    for (const [index, items] of lines.entries()) {
      const fontSize = Math.max(...items.map(item => item.style.fontSize));
      const leading = baseStyle.lineHeight ?? fontSize;
      if (usedHeight + leading > height + 0.01 && columns > 1) {column++; usedHeight = 0;}
      if (column >= columns) return;
      const alignedColumn = baseDirection === "rtl" ? columns - 1 - column : column;
      let contentWidth = items.reduce((sum,item) => sum + item.width,0);
      if(saved && contentWidth>0 && columnWidth>0) {
        // Saved runs supply their measured endpoints. Preserve outlines and fit
        // glyph advances to that source extent while native per-glyph metrics evolve.
        // These source adjustments precede fitting to the saved endpoint.
        if(hasSavedSpacing)for(const item of items) {
          for(const piece of item.pieces) {
            const scale=piece.style.fontSize*(piece.run.fontSizeScale ?? 1)*(piece.style.horizontalScale ?? 1)/piece.run.unitsPerEm;
            const adjustment=((saved.characterSpacing ?? 0)+(/^\s+$/.test(item.text)?saved.extraSpace ?? 0:0))/scale;
            piece.run={...piece.run,totalAdvance:piece.run.totalAdvance+adjustment*piece.run.glyphs.length,
              glyphs:piece.run.glyphs.map(glyph=>({...glyph,xAdvance:glyph.xAdvance+adjustment}))};
          }
          item.width=item.pieces.reduce((sum,piece)=>sum+backend.measureShapedRun(piece.run,piece.style.fontSize)*(piece.style.horizontalScale ?? 1),0);
        }
        contentWidth=items.reduce((sum,item)=>sum+item.width,0);
        const ratio=columnWidth/contentWidth;
        const wordSpaces=items.filter(item=>/^\s+$/.test(item.text));
        const spaceWidth=wordSpaces.reduce((sum,item)=>sum+item.width,0);
        const fitSpaces=baseDirection==="rtl" && items.every(item=>!!item.style.arabicFontName) &&
          wordSpaces.length>0 && spaceWidth+columnWidth-contentWidth>=-0.001;
        // A standalone symbol's saved extent is its font cell measurement;
        // fit the symbol itself when the host provides a metrically different face.
        const fitSymbol=items.length===1 && items[0]!.style.latinFontName==="Symbol" &&
          items[0]!.pieces.reduce((sum,piece)=>sum+piece.run.glyphs.length,0)===1;
        for(const item of items) {
          if(fitSpaces && spaceWidth===0 && /^\s+$/.test(item.text)) {
            const width=Math.max(0,columnWidth-contentWidth)/wordSpaces.length;
            item.width=width;
            const piece=item.pieces.at(-1);
            if(!piece)continue;
            const advance=width/(piece.style.fontSize*(piece.run.fontSizeScale ?? 1)*(piece.style.horizontalScale ?? 1))*piece.run.unitsPerEm;
            piece.run={...piece.run,totalAdvance:advance,glyphs:piece.run.glyphs.map((glyph,index)=>({...glyph,xAdvance:index===piece.run.glyphs.length-1?advance:0}))};
            continue;
          }
          const itemRatio=fitSpaces ? (/^\s+$/.test(item.text)?(spaceWidth+columnWidth-contentWidth)/spaceWidth:1) : ratio;
          item.width*=itemRatio;
          for(const piece of item.pieces)piece.run=fitSymbol
            ? {...piece.run,fontSizeScale:(piece.run.fontSizeScale ?? 1)*ratio}
            : {...piece.run,totalAdvance:piece.run.totalAdvance*itemRatio,
              glyphs:piece.run.glyphs.map(glyph=>({...glyph,xAdvance:glyph.xAdvance*itemRatio}))};
        }
        contentWidth=columnWidth;
      }
      const align = saved ? "left" : baseStyle.alignment ?? (baseDirection === "rtl" ? "right" : "left");
      const spaces = items.filter(item => /^\s+$/.test(item.text)).length;
      const extraSpace = align === "justify" && index < lines.length - 1 && spaces
        ? Math.max(0,columnWidth-contentWidth)/spaces : 0;
      const offset = align === "center" ? (columnWidth-contentWidth)/2
        : align === "right" || (align === "justify" && baseDirection === "rtl" && !extraSpace) ? columnWidth-contentWidth : 0;
      let pen = alignedColumn * (columnWidth + gap) + offset;
      const ordered = baseDirection === "rtl" ? [...items].reverse() : items;
      for (const item of ordered) {
        const itemStart=pen;
        for (const piece of item.pieces) {
          const localY = -usedHeight - (saved?.baseline ?? fontSize) - (piece.style.baselineShift ?? 0);
          backend.drawShapedRun(piece.run, x + pen * Math.cos(radians) - localY * Math.sin(radians),
            pageHeight - top + pen * Math.sin(radians) + localY * Math.cos(radians),piece.style.fontSize,rotation,piece.style);
          pen += backend.measureShapedRun(piece.run,piece.style.fontSize)*(piece.style.horizontalScale ?? 1);
        }
        pen = itemStart+item.width+(/^\s+$/.test(item.text) ? extraSpace : 0);
      }
      usedHeight += leading;
    }
    if(!saved)usedHeight+=baseStyle.paragraphAfter ?? 0;
  }
}
