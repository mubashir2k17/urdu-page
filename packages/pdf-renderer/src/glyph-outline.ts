import type {Path} from "@pdf-lib/fontkit";
import {appendBezierCurve,closePath,lineTo,moveTo,type PDFOperator} from "pdf-lib";

/** Convert font outlines to page paths, avoiding text rasterizer grid fitting. */
export function glyphOutline(path:Path,transform:(x:number,y:number)=>[number,number]):PDFOperator[] {
  const operators:PDFOperator[]=[];
  let x=0,y=0,startX=0,startY=0;
  path.toFunction()({
    moveTo(a:number,b:number){x=startX=a;y=startY=b;operators.push(moveTo(...transform(a,b)));},
    lineTo(a:number,b:number){x=a;y=b;operators.push(lineTo(...transform(a,b)));},
    quadraticCurveTo(a:number,b:number,c:number,d:number){
      operators.push(appendBezierCurve(...transform(x+2*(a-x)/3,y+2*(b-y)/3),
        ...transform(c+2*(a-c)/3,d+2*(b-d)/3),...transform(c,d)));
      x=c;y=d;
    },
    bezierCurveTo(a:number,b:number,c:number,d:number,e:number,f:number){
      operators.push(appendBezierCurve(...transform(a,b),...transform(c,d),...transform(e,f)));
      x=e;y=f;
    },
    closePath(){x=startX;y=startY;operators.push(closePath());},
  });
  return operators;
}
