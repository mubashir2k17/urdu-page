import type { PageObject, Story, TextStyle } from "@inpage/document-model";
import type { ShapedGlyph, ShapedRun } from "@inpage/text-shaper";
import type { PdfBackend } from "./backend.js";
import { resolveSpacingCalibration } from "./spacing-calibration.js";
import type { ResolvedSpacingCalibration, SpacingOptions } from "./spacing-calibration.js";

type Direction = "ltr" | "rtl";
type Shape = (text: string, direction: Direction, style?: TextStyle,
  codes?: readonly (number | undefined)[], legacyRunKind?: number) => ShapedRun;
interface Token {text: string; style: TextStyle; run: ShapedRun; width: number; direction: Direction;
  pieces: {run:ShapedRun;style:TextStyle}[]}
type Piece = Token["pieces"][number];

/** Lay out source-sized runs; unavailable styles retain the existing fallback shaper. */
export function drawStyledStory(story: Story, object: PageObject, backend: PdfBackend, shape: Shape, pageHeight: number,
  saved?:{baseline:number;characterSpacing?:number;extraSpace?:number;kashidaCount?:number},
  spacing: SpacingOptions = {}): void {
  if(story.cachedLayout && story.cachedLayout.frameId===object.id && !saved) {
    const cache=story.cachedLayout;
    const insetX=cache.columns===1?Math.max(0,(object.bounds.widthPoints-cache.columnWidth)/2):0;
    const insetY=cache.lines.length===1 && cache.lines[0]!.height>cache.contentHeight ? cache.contentHeight-cache.lines[0]!.height : Math.max(0,(object.bounds.heightPoints-cache.contentHeight)/2);
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
        let baseline = (run.baseline ?? line.baseline)+before;
        const fontName = run.runs[0]?.style?.arabicFontName;
        const fontSize = run.runs[0]?.style?.fontSize ?? 12;
        if (!run.baseline && (fontName === "Trad Arabic" || fontName === "Trad Arabic Bold") && Math.abs(line.baseline - fontSize * 0.975) < 0.05) {
          baseline += fontSize * (1.080458 - 0.975);
        }
        drawStyledStory(group,frame,backend,shape,pageHeight,{baseline,
          ...(run.characterSpacing===undefined?{}:{characterSpacing:run.characterSpacing}),
          ...(run.extraSpace===undefined?{}:{extraSpace:run.extraSpace}),
          ...(run.kashidaCount===undefined?{}:{kashidaCount:run.kashidaCount}),},spacing);
      }
      top+=line.height;
    }
    return;
  }
  const priors=spacing.priors;
  const hasPriorSpacing=!!(priors && (priors.characterSpacing || priors.wordSpacing));
  const hasSavedSpacing=!!(saved && (saved.characterSpacing || saved.extraSpace))
    || (!!saved && hasPriorSpacing);
  const calibrationCache=new Map<string,ResolvedSpacingCalibration>();
  const calibrationFor=(fontId:string|undefined):ResolvedSpacingCalibration=>{
    const key=fontId ?? "";
    let resolved=calibrationCache.get(key);
    if(!resolved){resolved=resolveSpacingCalibration(spacing.calibration,fontId);calibrationCache.set(key,resolved);}
    return resolved;
  };
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
      const cells:{text:string;style:TextStyle;codes?:(number|undefined)[]|undefined;legacyRunKind?:number|undefined}[][] = [[]];
      for (const source of paragraph.runs) {
        const parts=source.text.split("\t");
        let scalarOffset=0;
        parts.forEach((text,index)=>{
          if(index)cells.push([]);
          const end=scalarOffset+[...text].length;
          if(text)cells.at(-1)!.push({text,style:source.style ?? baseStyle,
            codes:source.charCodes?.slice(scalarOffset,end),legacyRunKind:source.legacyRunKind});
          scalarOffset=end+(index<parts.length-1?1:0);
        });
      }
      let distance=0,alignment=0;
      const stops=[...baseStyle.tabStops].sort((a,b)=>a.position-b.position);
      for (const [cellIndex,cell] of cells.entries()) {
        const untrimmed=cell.map(part=>part.text).join("");
        const content=untrimmed.trim();
        const leading=[...untrimmed.slice(0,untrimmed.length-untrimmed.trimStart().length)].length;
        const aligned=cell.every(part=>part.codes)?cell.flatMap(part=>part.codes!):undefined;
        const codes=aligned?.slice(leading,leading+[...content].length);
        const firstKind=cell[0]?.legacyRunKind;
        const legacyRunKind=cell.every(part=>part.legacyRunKind===firstKind)?firstKind:undefined;
        const style=cell[0]?.style ?? baseStyle;
        const direction:Direction=/[\u0600-\u06ff]/.test(content)?"rtl":"ltr";
        const run=shape(content,direction,style,codes,legacyRunKind);
        const cellWidth=backend.measureShapedRun(run,style.fontSize);
        const anchor=width-distance;
        let localX=anchor-cellWidth;
        if(alignment===1)localX=anchor;
        if(alignment===3 && content.includes(".")) {
          const prefix=content.split(".")[0]!;
          localX=anchor-backend.measureShapedRun(shape(prefix,direction,style,codes?.slice(0,[...prefix].length),legacyRunKind),style.fontSize);
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
    const preserveLeadingSpaces=hasSavedSpacing || !!saved?.kashidaCount || !!saved;
    // Trailing glue is retained only when the source saved spacing, matching
    // the native extent: otherwise word processors drop it and including it
    // would move interior words.
    const preserveTrailingSpaces=hasSavedSpacing || !!saved?.kashidaCount;
    const tokens: Token[] = [];
    const sources: {text:string;style:TextStyle;scalarStyles:TextStyle[];
      charCodes?:(number|undefined)[]|undefined;legacyRunKind?:number|undefined}[] = [];
    for (const source of paragraph.runs) {
      const style = source.style ?? baseStyle;
      const previous = sources.at(-1);
      const shapeKey = (style:TextStyle) => JSON.stringify({...style,baselineShift:0,trackingEm:0,trackingPoints:0});
      if (previous && previous.legacyRunKind === source.legacyRunKind && shapeKey(previous.style) === shapeKey(style)) {
        previous.text += source.text;
        previous.scalarStyles.push(...[...source.text].map(() => style));
        previous.charCodes = previous.charCodes && source.charCodes
          ? [...previous.charCodes,...source.charCodes] : undefined;
      } else sources.push({text:source.text,style,scalarStyles:[...source.text].map(() => style),
        charCodes:source.charCodes?.slice(),legacyRunKind:source.legacyRunKind});
    }
    for (const source of sources) {
      const style = source.style ?? baseStyle;
      const useShared = style.arabicFontName === "Noori Nastaliq" || source.legacyRunKind === 0x7f8b;
      const candidate = /[\u0600-\u06ff]/.test(source.text) && useShared
        ? shape(source.text,"rtl",style,source.charCodes,source.legacyRunKind) : undefined;
      // A disabled/unavailable code shaper must retain the original token path.
      const shared = source.legacyRunKind === 0x7f8b && !candidate?.legacyCodeShaped ? undefined : candidate;
      let scalarOffset = 0;
      for (const text of source.text.match(/\s+|[^\s]+/g) ?? []) {
        // Glue follows the run's direction/font (Arabic spaces in the Arabic
        // face) instead of being forced through the LTR fallback.
        const direction: Direction = /^\s+$/.test(text)
          ? baseDirection : /[\u0600-\u06ff]/.test(text) ? "rtl" : "ltr";
        const end = scalarOffset + [...text].length;
        const codes = source.charCodes?.slice(scalarOffset,end);
        const glyphs = shared?.glyphs.filter(glyph => glyph.cluster >= scalarOffset && glyph.cluster < end)
          .map(glyph => ({...glyph,cluster:glyph.cluster-scalarOffset}));
        const glueToken=/^\s+$/.test(text);
        let run = shared && glyphs ? {...shared, logicalText:text,glyphs,
          totalAdvance:glyphs.reduce((sum,glyph) => sum+glyph.xAdvance,0)}
          : shape(text,direction,style,codes,source.legacyRunKind);
        if(glueToken) {
          // Oracle-measured correction to the font's natural space advance.
          const spaceScale=calibrationFor(run.fontId).spaceScale;
          if(spaceScale!==1) run={...run,glyphs:run.glyphs.map(glyph=>({...glyph,xAdvance:glyph.xAdvance*spaceScale})),
            totalAdvance:run.totalAdvance*spaceScale};
        }
        const pieces: Token["pieces"] = [];
        for (const originalGlyph of run.glyphs) {
          const glyph = {...originalGlyph};
          const glyphStyle = source.scalarStyles[scalarOffset + glyph.cluster] ?? style;
          if (glyph.xAdvance && /\S/.test(text)) {
            const trackingScale=calibrationFor(glyph.fontId ?? run.fontId).trackingScale;
            glyph.xAdvance += ((glyphStyle.trackingEm ?? 0) + (glyphStyle.trackingPoints ?? 0) / style.fontSize)
              * run.unitsPerEm * trackingScale;
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
    if(saved?.kashidaCount) {
      // Native distribution: weighted floor allocation, then round-robin in reading order.
      const candidates=tokens.flatMap(item=>item.pieces.flatMap(piece=>piece.run.glyphs.filter(glyph=>glyph.kashida)
        .map(glyph=>({glyph,piece,item,count:0}))).sort((a,b)=>a.glyph.cluster-b.glyph.cluster));
      const weight=candidates.reduce((sum,item)=>sum+item.glyph.kashida!.weight,0);
      if(weight>0) {
        let remaining=saved.kashidaCount;
        for(const candidate of candidates){candidate.count=Math.floor(saved.kashidaCount*candidate.glyph.kashida!.weight/weight);remaining-=candidate.count;}
        for(let i=0;remaining>0;i++,remaining--)candidates[i%candidates.length]!.count++;
        const counts=new Map(candidates.map(item=>[item.glyph,item.count]));
        for(const item of tokens)for(const piece of item.pieces) {
          piece.run={...piece.run,glyphs:piece.run.glyphs.flatMap(glyph=>{
            const extension=glyph.kashida,count=counts.get(glyph) ?? 0;
            if(!extension || !count)return [glyph];
            const kashidaUnit=calibrationFor(extension.fontId).kashidaUnit;
            return [glyph,...Array.from({length:count},():ShapedGlyph=>({id:extension.id,fontId:extension.fontId,cluster:glyph.cluster,
              xAdvance:extension.advance*kashidaUnit,yAdvance:0,xOffset:0,yOffset:0}))];
          })};
          piece.run.totalAdvance=piece.run.glyphs.reduce((sum,glyph)=>sum+glyph.xAdvance,0);
        }
        for(const item of tokens)item.width=item.pieces.reduce((sum,piece)=>sum+backend.measureShapedRun(piece.run,piece.style.fontSize)*(piece.style.horizontalScale ?? 1),0);
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
      if (!preserveLeadingSpaces && !line.length && /^\s+$/.test(token.text)) continue;
      line.push(token); lineWidth += token.width;
    }
    while (!preserveTrailingSpaces && line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop();
    if (line.length) lines.push(line);
    for (const [index, items] of lines.entries()) {
      const fontSize = Math.max(...items.map(item => item.style.fontSize));
      const leading = baseStyle.lineHeight ?? fontSize;
      if (usedHeight + leading > height + 0.01 && columns > 1) {column++; usedHeight = 0;}
      if (column >= columns) return;
      const alignedColumn = baseDirection === "rtl" ? columns - 1 - column : column;
      let contentWidth = items.reduce((sum,item) => sum + item.width,0);
      if(saved && contentWidth>0 && columnWidth>0) {
        // Saved runs supply their measured endpoint. Apply the decoded
        // character/word spacing first, then give the residual to stretch zones
        // in priority order — word spaces, kashida carriers, inter-glyph
        // tracking — rather than scaling every glyph advance uniformly.
        if(hasSavedSpacing) {
          let lastPiece: Piece | null = null;
          let lastGlyphIdx = -1;
          for(const item of items) {
            for(const piece of item.pieces) {
              if(piece.run.glyphs.length > 0) {
                lastPiece = piece;
                lastGlyphIdx = piece.run.glyphs.length - 1;
              }
            }
          }
          for(const item of items) {
            const isSpace = isGlue(item);
            for(const piece of item.pieces) {
              const scale=piece.style.fontSize*(piece.run.fontSizeScale ?? 1)*(piece.style.horizontalScale ?? 1)/piece.run.unitsPerEm;
              const charSpacing = (saved.characterSpacing ?? priors?.characterSpacing ?? 0) / scale;
              const extraSpace = (isSpace ? (saved.extraSpace ?? priors?.wordSpacing ?? 0) : 0) / scale;
              const isLastPiece = (piece === lastPiece);
              piece.run={
                ...piece.run,
                glyphs:piece.run.glyphs.map((glyph,index)=>{
                  const isVeryLastGlyph = isLastPiece && (index === lastGlyphIdx) && !isSpace;
                  const adj = (isVeryLastGlyph ? 0 : charSpacing) + extraSpace;
                  return {...glyph,xAdvance:glyph.xAdvance+adj};
                })
              };
              piece.run.totalAdvance=piece.run.glyphs.reduce((sum,g)=>sum+g.xAdvance,0);
            }
            recomputeItemWidth(item,backend);
          }
        }
        contentWidth=items.reduce((sum,item)=>sum+item.width,0);
        const residual=columnWidth-contentWidth;
        const wordSpaces=items.filter(isGlue);
        const spaceWidth=wordSpaces.reduce((sum,item)=>sum+item.width,0);
        // Native source lines whose runs all use the Arabic face distribute
        // the fit residual through word spaces (ADR-020 stretch zones). Where
        // the spacing mode is unknown, keep uniform fitting: the reference
        // fixture shows it tracks the source glyph metrics more closely than
        // blind zone redistribution.
        const hasKashidaCarrier=items.some(item=>item.pieces.some(piece=>
          piece.run.glyphs.some(glyph=>!!glyph.kashida)));
        const useSpaceFit=baseDirection==="rtl" && items.every(item=>!!item.style.arabicFontName) &&
          (wordSpaces.length>0 || hasKashidaCarrier) && spaceWidth+residual>=-0.001;
        if(useSpaceFit) {
          distributeResidual(items,residual,backend);
        } else if(contentWidth>0) {
          const ratio=columnWidth/contentWidth;
          // A standalone symbol's saved extent is its font cell measurement;
          // fit the symbol itself when the host face differs metrically.
          const fitSymbol=items.length===1 && items[0]!.style.latinFontName==="Symbol" &&
            items[0]!.pieces.reduce((sum,piece)=>sum+piece.run.glyphs.length,0)===1;
          fitUniformRatio(items,ratio,fitSymbol);
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

function isGlue(item: Token): boolean {
  return /^\s+$/.test(item.text);
}

/** Points contributed by one font unit, including appearance horizontal scale. */
function piecePointScale(piece: Piece): number {
  return piece.style.fontSize * (piece.run.fontSizeScale ?? 1) * (piece.style.horizontalScale ?? 1) / piece.run.unitsPerEm;
}

function recomputeItemWidth(item: Token, backend: PdfBackend): void {
  item.width = item.pieces.reduce(
    (sum, piece) => sum + backend.measureShapedRun(piece.run, piece.style.fontSize) * (piece.style.horizontalScale ?? 1),
    0,
  );
}

function sumGlyphs(items: readonly Token[]): number {
  return items.reduce((sum, item) => sum + item.pieces.reduce((pSum, piece) => pSum + piece.run.glyphs.length, 0), 0);
}

/**
 * Give a residual width to word-space glue. The residual is shared in
 * proportion to each glue run's natural width (equivalent to the native
 * per-space spacing); negative residuals may shrink glue to zero but never
 * past it.
 */
function applyGlueStretch(glue: readonly Token[], points: number, backend: PdfBackend): number {
  if (!glue.length) return points;
  const glueWidth = glue.reduce((sum, item) => sum + item.width, 0);
  const applied = points < 0 ? Math.max(points, -glueWidth) : points;
  for (const item of glue) {
    // Preserve the relative widths the source font assigned to each glue run;
    // equal-per-unit would distort mixed-width spaces.
    const itemShare = glueWidth > 0
      ? applied * (item.width / glueWidth)
      : applied / glue.length;
    const glyphTotal = item.pieces.reduce(
      (sum, piece) => sum + piece.run.glyphs.reduce((glyphSum, glyph) => glyphSum + Math.abs(glyph.xAdvance), 0),
      0,
    );
    for (const piece of item.pieces) {
      const scale = piecePointScale(piece);
      if (!scale) continue;
      const glyphs = piece.run.glyphs;
      const pieceTotal = glyphs.reduce((sum, glyph) => sum + Math.abs(glyph.xAdvance), 0);
      const pieceShare = glyphTotal > 0
        ? itemShare * (pieceTotal / glyphTotal)
        : itemShare / item.pieces.length;
      piece.run = {...piece.run, glyphs: glyphs.map((glyph) => {
        const glyphShare = pieceTotal > 0
          ? pieceShare * (Math.abs(glyph.xAdvance) / pieceTotal)
          : pieceShare / glyphs.length;
        return {...glyph, xAdvance: glyph.xAdvance + glyphShare / scale};
      })};
      piece.run.totalAdvance = piece.run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    }
    recomputeItemWidth(item, backend);
  }
  return points - applied;
}

function stretchGlue(items: readonly Token[], points: number, backend: PdfBackend): number {
  return applyGlueStretch(items.filter(isGlue), points, backend);
}

/**
 * Continue a residual on kashida carriers as a fractional advance, weighted by
 * the native kashida weight. This avoids scaling ordinary letters and does not
 * re-insert glyphs that were already distributed.
 */
function stretchKashida(items: readonly Token[], points: number, backend: PdfBackend): number {
  const carriers: {piece: Piece; index: number; weight: number}[] = [];
  for (const item of items) {
    for (const piece of item.pieces) {
      piece.run.glyphs.forEach((glyph, index) => {
        if (glyph.kashida) carriers.push({piece, index, weight: glyph.kashida.weight || 1});
      });
    }
  }
  if (!carriers.length) return points;
  const totalWeight = carriers.reduce((sum, carrier) => sum + carrier.weight, 0);
  const perWeight = points / totalWeight;
  const deltas = new Map<Piece, Map<number, number>>();
  for (const carrier of carriers) {
    const map = deltas.get(carrier.piece) ?? new Map<number, number>();
    map.set(carrier.index, (map.get(carrier.index) ?? 0) + perWeight * carrier.weight);
    deltas.set(carrier.piece, map);
  }
  for (const item of items) {
    let touched = false;
    for (const piece of item.pieces) {
      const map = deltas.get(piece);
      if (!map) continue;
      touched = true;
      const scale = piecePointScale(piece);
      if (!scale) continue;
      piece.run = {...piece.run, glyphs: piece.run.glyphs.map((glyph, index) => {
        const delta = map.get(index);
        return delta === undefined ? glyph : {...glyph, xAdvance: glyph.xAdvance + delta / scale};
      })};
      piece.run.totalAdvance = piece.run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    }
    if (touched) recomputeItemWidth(item, backend);
  }
  return 0;
}

/**
 * Last-resort residual: distribute proportionally to every glyph advance so
 * relative advances are preserved when no words or kashidas can absorb it.
 */
function stretchTracking(items: readonly Token[], points: number, backend: PdfBackend): number {
  const total = sumGlyphs(items);
  if (!total) return points;
  const totalAdvance = items.reduce(
    (sum, item) => sum + item.pieces.reduce(
      (pieceSum, piece) => pieceSum + piece.run.glyphs.reduce((glyphSum, glyph) => glyphSum + glyph.xAdvance, 0),
      0,
    ),
    0,
  );
  for (const item of items) {
    for (const piece of item.pieces) {
      const scale = piecePointScale(piece);
      if (!scale) continue;
      const glyphs = piece.run.glyphs;
      piece.run = {...piece.run, glyphs: glyphs.map((glyph) => {
        // Proportional tracking keeps the native relative advances intact;
        // equal gaps would distort lines with strongly varying glyph widths.
        const share = totalAdvance !== 0 ? glyph.xAdvance / totalAdvance : 1 / total;
        return {...glyph, xAdvance: glyph.xAdvance + (points * share) / scale};
      })};
      piece.run.totalAdvance = piece.run.glyphs.reduce((sum, glyph) => sum + glyph.xAdvance, 0);
    }
    recomputeItemWidth(item, backend);
  }
  return 0;
}

/**
 * A standalone symbol's saved extent is its font cell measurement, so fit the
 * symbol itself. Restricting this to Symbol avoids scaling real glyph outlines
 * just because a run happens to contain one glyph.
 */
function stretchCell(items: readonly Token[], points: number, backend: PdfBackend): number {
  const item = items[0];
  if (!item || items.length !== 1 || item.style.latinFontName !== "Symbol") return points;
  if (sumGlyphs(items) !== 1 || !item.width) return points;
  const factor = (item.width + points) / item.width;
  for (const piece of item.pieces) {
    piece.run = {...piece.run, fontSizeScale: (piece.run.fontSizeScale ?? 1) * factor};
  }
  recomputeItemWidth(item, backend);
  return 0;
}

/** Uniform fallback: scale every advance to the saved extent. */
function fitUniformRatio(items: readonly Token[], ratio: number, fitSymbol: boolean): void {
  for (const item of items) {
    item.width *= ratio;
    for (const piece of item.pieces) {
      piece.run = fitSymbol
        ? {...piece.run, fontSizeScale: (piece.run.fontSizeScale ?? 1) * ratio}
        : {...piece.run, totalAdvance: piece.run.totalAdvance * ratio,
          glyphs: piece.run.glyphs.map((glyph) => ({...glyph, xAdvance: glyph.xAdvance * ratio}))};
    }
  }
}

function distributeResidual(items: readonly Token[], residual: number, backend: PdfBackend): void {
  if (!Number.isFinite(residual) || Math.abs(residual) < 1e-6) return;
  let remaining = residual;
  if (items.some(isGlue)) remaining = stretchGlue(items, remaining, backend);
  if (Math.abs(remaining) >= 1e-6) remaining = stretchKashida(items, remaining, backend);
  if (Math.abs(remaining) >= 1e-6) remaining = stretchTracking(items, remaining, backend);
  if (Math.abs(remaining) >= 1e-6) stretchCell(items, remaining, backend);
}
