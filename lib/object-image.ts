// Deterministic pixel mapping shared by browser/worker and offline evaluation.
// No browser canvas interpolation, aspect distortion or image uploads.
export function squareCrop(width:number,height:number,padding=0.04) {
 if(![width,height].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid crop dimensions.');
 const side=Math.max(width,height)*(1+2*padding);
 return {side,x:(side-width)/2,y:(side-height)/2};
}

export function selectedMaskIndex(scores:number[],mask:ArrayLike<number|bigint>,width:number,height:number,point:{x:number;y:number},requirePoint=true,box?:{x1:number;y1:number;x2:number;y2:number}) {
 if(!scores.length||scores.some(n=>!Number.isFinite(n))||mask.length!==scores.length*width*height)throw Error('Invalid segmentation output.');
 const clicked=Math.min(height-1,Math.floor(point.y*height))*width+Math.min(width-1,Math.floor(point.x*width));
 let eligible:{score:number;index:number}[];
 if(box) {
  const bx1=Math.floor(Math.min(box.x1,box.x2)*width),bx2=Math.ceil(Math.max(box.x1,box.x2)*width);
  const by1=Math.floor(Math.min(box.y1,box.y2)*height),by2=Math.ceil(Math.max(box.y1,box.y2)*height);
  eligible=scores.map((score,index)=>{
   const offset=index*width*height;
   let insideCount=0;
   const hasClicked=Number(mask[offset+clicked])>0;
   for(let y=Math.max(0,by1);y<=Math.min(height-1,by2);y++){
    for(let x=Math.max(0,bx1);x<=Math.min(width-1,bx2);x++){
     if(Number(mask[offset+y*width+x])>0)insideCount++;
    }
   }
   return {score,index,insideCount,hasClicked};
  }).filter(item=>!requirePoint||item.hasClicked||item.insideCount>0);
 } else {
  eligible=scores.map((score,index)=>({score,index})).filter(({index})=>!requirePoint||Number(mask[index*width*height+clicked])>0);
 }
 if(!eligible.length)throw Error('No object found at your tap. Tap inside the object and retry.');
 return eligible.sort((a,b)=>b.score-a.score)[0].index;
}

export function renderObjectCrop(pixels:Uint8ClampedArray,mask:Uint8Array,width:number,height:number,crop:[number,number,number,number],version:1|2) {
 const [left,top,cw,ch]=crop;
 if(pixels.length!==width*height*4||mask.length!==width*height||crop.some(n=>!Number.isInteger(n)||n<0)||!cw||!ch||left+cw>width||top+ch>height)throw Error('Invalid crop mapping.');
 const square=squareCrop(cw,ch),w=version===2?224:cw,h=version===2?224:ch;
 const data=new Uint8ClampedArray(w*h*3),foreground=Array<number>(32).fill(0);
 function channel(x:number,y:number,c:number){return x<left||x>=left+cw||y<top||y>=top+ch?255:pixels[(y*width+x)*4+c];}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
  const sx=version===2?(x+0.5)/w*square.side-square.x+left-0.5:x+left;
  const sy=version===2?(y+0.5)/h*square.side-square.y+top-0.5:y+top;
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  for(let c=0;c<3;c++)data[(y*w+x)*3+c]=(1-fy)*((1-fx)*channel(ix,iy,c)+fx*channel(ix+1,iy,c))+fy*((1-fx)*channel(ix,iy+1,c)+fx*channel(ix+1,iy+1,c));
  const mx=Math.round(sx),my=Math.round(sy);
  if(mx>=left&&mx<left+cw&&my>=top&&my<top+ch&&mask[my*width+mx])foreground[Math.min(7,Math.floor(y/h*8))*4+Math.min(3,Math.floor(x/w*4))]+=32/(w*h);
 }
 return {data,width:w,height:h,foreground:foreground.map(n=>Math.min(1,n))};
}
