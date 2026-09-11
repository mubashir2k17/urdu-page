interface CachedRun {kind:number;start:number;end:number;x:number;width:number;baseline?:number;characterSpacing?:number;extraSpace?:number;kashidaCount?:number}
interface CachedLine {start:number;end:number;height:number;baseline:number;width:number;paragraphStart:boolean;runs:CachedRun[]}
interface CachedFrame {id:number;columnWidth:number;contentHeight:number;columns:number}

/** Accept only a complete saved line table whose byte coverage matches the text/style pair. */
export function readCachedLayout(data:Uint8Array,after:number,total:number):{frames:CachedFrame[];lines:CachedLine[]}|undefined {
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  for(let candidate=after;candidate+32<data.length;candidate++) {
    if(view.getUint32(candidate,true)!==0xffffffff || view.getUint32(candidate+4,true)!==0 || view.getUint32(candidate+8,true)!==0)continue;
    const lines:CachedLine[]=[];
    let p=candidate+12,covered=0;
    while(p+32<=data.length && covered<total) {
      const count=view.getUint32(p,true),height=view.getUint32(p+4,true),length=view.getUint32(p+12,true);
      const runCount=view.getUint16(p+20,true);
      if(!count || count>total-covered || !height || height>4_000_000 || length!==16+30*runCount || !runCount || p+16+length>data.length)break;
      const runs:CachedRun[]=[];
      for(let i=0;i<runCount;i++) {
        const r=p+32+i*30;
        const kind=view.getUint16(r,true),start=view.getUint16(r+4,true),end=view.getUint16(r+6,true);
        if(kind<0x7f00 || kind>0x7fff || start>end || end>count)break;
        const x=view.getInt32(r+8,true)/2000,right=view.getInt32(r+12,true)/2000;
        runs.push({kind,start,end,x,width:right-x,...readRunSpacing(view,r,kind)});
      }
      if(runs.length!==runCount)break;
      lines.push({start:covered,end:covered+count,height:height/2000,paragraphStart:view.getUint32(p+8,true)===1,baseline:view.getInt32(p+16,true)/2000,
        width:view.getInt32(p+28,true)/2000,runs});
      covered+=count;p+=16+length;
    }
    if(covered!==total)continue;
    const frames:CachedFrame[]=[];
    // Saved frame records precede the line marker, with an empty record after each story.
    for(let start=after;start+62<=candidate;start++) {
      if(view.getUint32(start,true)!==50)continue;
      let q=start;
      const found:CachedFrame[]=[];
      let active:CachedFrame|undefined;
      while(q+62<=candidate && view.getUint32(q,true)===50) {
        const id=view.getUint16(q+28,true);
        if(id) {
          const frame={id,contentHeight:view.getInt32(q+12,true)/2000,columnWidth:view.getInt32(q+16,true)/2000,columns:1};
          if(frame.contentHeight<=0 || frame.columnWidth<=0)break;
          if(active?.id===id)active.columns++;
          else if(!active)active=frame;
          else break;
        } else if(active) {found.push(active);active=undefined;}
        q+=62;
      }
      if(q===candidate && !active && found.length){frames.push(...found);break;}
    }
    if(frames.length) {
      expandCells(view,data.length,p,lines);
      return {frames,lines};
    }
  }
  return;
}

function expandCells(view:DataView,length:number,after:number,lines:CachedLine[]):void {
  const parents=lines.filter(line=>line.runs.some(run=>run.kind===0x7f87));
  const expected=parents.reduce((sum,line)=>sum+line.end-line.start,0);
  if(!expected)return;
  const children:CachedLine[]=[];
  let covered=0;
  for(let candidate=after;candidate+32<length && covered<expected;candidate++) {
    if(view.getUint32(candidate,true)!==0xffffffff || view.getUint32(candidate+4,true)!==0 || view.getUint32(candidate+8,true)!==0)continue;
    let p=candidate+12;
    const found:CachedLine[]=[];
    let countSum=0;
    while(p+32<=length && covered+countSum<expected) {
      const count=view.getUint32(p,true),height=view.getUint32(p+4,true),size=view.getUint32(p+12,true);
      const runCount=view.getUint16(p+20,true);
      if(!count || count>expected-covered-countSum || !height || height>4_000_000 || size!==16+30*runCount || !runCount || p+16+size>length)break;
      const runs:CachedRun[]=[];
      for(let i=0;i<runCount;i++) {
        const r=p+32+i*30,kind=view.getUint16(r,true),start=view.getUint16(r+4,true),end=view.getUint16(r+6,true);
        if(kind<0x7f00 || kind>0x7fff || start>end || end>count)break;
        const x=view.getInt32(r+8,true)/2000;
        runs.push({kind,start,end,x,width:view.getInt32(r+12,true)/2000-x,...readRunSpacing(view,r,kind)});
      }
      if(runs.length!==runCount)break;
      found.push({start:countSum,end:countSum+count,height:height/2000,paragraphStart:view.getUint32(p+8,true)===1,baseline:view.getInt32(p+16,true)/2000,
        width:view.getInt32(p+28,true)/2000,runs});
      countSum+=count;p+=16+size;
    }
    if(found.length){children.push(...found);covered+=countSum;candidate=p-1;}
  }
  if(covered!==expected)return;
  const replacements:CachedRun[][]=[];
  let childIndex=0;
  for(const parent of parents) {
    const runs:CachedRun[]=[];
    let sourceOffset=0;
    for(const cell of [...parent.runs].reverse().filter(run=>run.width>0)) {
      let top=0;
      while(top<parent.height-0.01) {
        const child=children[childIndex++];
        if(!child || Math.abs(child.width-cell.width)>0.01 || top+child.height>parent.height+0.01)return;
        runs.push(...child.runs.map(run=>({...run,start:sourceOffset+run.start,end:sourceOffset+run.end,
          x:cell.x+run.x,baseline:top+child.baseline})));
        sourceOffset+=child.end-child.start;top+=child.height;
      }
    }
    if(sourceOffset!==parent.end-parent.start)return;
    replacements.push(runs);
  }
  if(childIndex!==children.length)return;
  parents.forEach((parent,index)=>{parent.runs=replacements[index]!;});
}

/** +18 is Latin tracking or an Arabic kashida count, depending on the run kind. */
function readRunSpacing(view:DataView,offset:number,kind:number):Pick<CachedRun,"characterSpacing"|"extraSpace"|"kashidaCount"> {
  if(kind===0x7f85 || kind===0x7f8b) {
    const count=view.getInt32(offset+18,true);
    return count>0 && count<=10000?{kashidaCount:count}:{};
  }
  if(kind!==0x7f80)return {};
  const spaces=view.getUint16(offset+16,true);
  return {characterSpacing:view.getInt32(offset+18,true)/2000,
    extraSpace:spaces?view.getInt32(offset+22,true)/2000/spaces:0};
}
