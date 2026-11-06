import { SamModel, AutoProcessor, RawImage, type SamProcessor } from '@huggingface/transformers';
import type { ObjectScan } from './object-scan.ts';
import { renderObjectCrop, selectedMaskIndex } from './object-image.ts';
import { OBJECT_DEVICE } from './object-runtime.ts';
export const SAM_MODEL='Xenova/slimsam-77-uniform';
export const SAM_REVISION='5850ab45f587c112167512ffef949107115e26a0';
export type ObjectPoint={x:number;y:number};
export type ObjectBox={x1:number;y1:number;x2:number;y2:number};
let model:ReturnType<typeof SamModel.from_pretrained>|undefined;
let processor:ReturnType<typeof AutoProcessor.from_pretrained>|undefined;
type PreparedObject={image:RawImage;quality:ObjectScan['quality'];foreground:number[]};

export async function prepareObjectImage(blob:Blob,point:ObjectPoint,progress:(message:string)=>void,cancelled:()=>boolean,version:1|2=2,box?:ObjectBox):Promise<PreparedObject&{alternatives:PreparedObject[]}> {
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1)throw Error(box?'Select an area within the object photo.':'Tap inside the object photo.');
 progress('Loading object isolation on this device…');
 model??=SamModel.from_pretrained(SAM_MODEL,{revision:SAM_REVISION,device:OBJECT_DEVICE,dtype:'q8'}).catch(e=>{model=undefined;throw e;});
 processor??=AutoProcessor.from_pretrained(SAM_MODEL,{revision:SAM_REVISION}).catch(e=>{processor=undefined;throw e;});
 const [sam,preprocess]=await Promise.all([model,processor]);
 if(cancelled())throw Error('Cancelled.');
 const url=URL.createObjectURL(blob);
 try {
  let image=await RawImage.fromURL(url);
  if(image.width>16384||image.height>16384)throw Error('Photo is too large. Retake with your camera.');
  const scale=Math.min(1,768/Math.max(image.width,image.height));
  if(scale<1)image=await image.resize(Math.round(image.width*scale),Math.round(image.height*scale));
  image=image.rgba();
  const {width,height}=image;
  const normalizedBox=box?{x1:Math.max(0,Math.min(1,Math.min(box.x1,box.x2))),y1:Math.max(0,Math.min(1,Math.min(box.y1,box.y2))),x2:Math.max(0,Math.min(1,Math.max(box.x1,box.x2))),y2:Math.max(0,Math.min(1,Math.max(box.y1,box.y2)))}:undefined;
  const inputs=await preprocess(image.clone(),normalizedBox?{input_points:[[[point.x*width,point.y*height],[normalizedBox.x1*width,normalizedBox.y1*height],[normalizedBox.x2*width,normalizedBox.y2*height]]],input_labels:[[[1,2,3]]]}:{input_points:[[[point.x*width,point.y*height]]]});
  progress('Isolating the object you selected…');
  const output=await sam(inputs);
  const masks=await (preprocess as SamProcessor).post_process_masks(output.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
  const scores=Array.from(output.iou_scores.data as Float32Array);
  if(!scores.length||scores.some(n=>!Number.isFinite(n))||!masks[0])throw Error('Object isolation returned invalid evidence. Retake the photo.');
  const mask=masks[0].data;
  if(mask.length!==scores.length*width*height)throw Error('Unexpected mask dimensions. Retake the photo.');
  const best=selectedMaskIndex(scores,mask,width,height,point,version===2,normalizedBox);
  const source=image;
  function prepareMask(best:number):PreparedObject {
  const offset=best*width*height;
  const selected=new Uint8Array(width*height);
  for(let i=0;i<selected.length;i++)selected[i]=Number(mask[offset+i])>0?1:0;
  let clicked=Math.min(height-1,Math.floor(point.y*height))*width+Math.min(width-1,Math.floor(point.x*width));
  if(version===2&&!selected[clicked]&&normalizedBox) {
   const bx1=Math.floor(normalizedBox.x1*width),bx2=Math.ceil(normalizedBox.x2*width);
   const by1=Math.floor(normalizedBox.y1*height),by2=Math.ceil(normalizedBox.y2*height);
   const targetX=point.x*width,targetY=point.y*height;
   let bestDist=Infinity;
   for(let y=Math.max(0,by1);y<=Math.min(height-1,by2);y++){
    for(let x=Math.max(0,bx1);x<=Math.min(width-1,bx2);x++){
     const idx=y*width+x;
     if(selected[idx]){
      const d=(x-targetX)**2+(y-targetY)**2;
      if(d<bestDist){bestDist=d;clicked=idx;}
     }
    }
   }
  }
  if(version===2&&!selected[clicked])throw Error(normalizedBox?'No object found in the selected area. Draw a box around the object and retry.':'No object found at your tap. Tap inside the object and retry.');
  if(version===2) {
   // Never union disconnected objects into one reference.
   const connected=new Uint8Array(selected.length),queue=new Int32Array(selected.length);let head=0,tail=1;queue[0]=clicked;connected[clicked]=1;
   while(head<tail) {
    const i=queue[head++],x=i%width,y=Math.floor(i/width);
    for(const j of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1])if(j>=0&&selected[j]&&!connected[j]){connected[j]=1;queue[tail++]=j;}
   }
   selected.set(connected);
  }
  let left=width,top=height,right=-1,bottom=-1,count=0,sum=0,squares=0,lap=0,lap2=0,lapCount=0;
  const pixels=new Uint8ClampedArray(width*height*4),gray=new Float32Array(width*height);
  if(source.channels!==4||source.data.length!==width*height*4)throw Error('Invalid source pixel layout. Retake the photo.');
  for(let i=0;i<gray.length;i++)gray[i]=0.2126*source.data[i*4]+0.7152*source.data[i*4+1]+0.0722*source.data[i*4+2];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
   const i=y*width+x,j=i*4,keep=selected[i]===1;
   if(keep){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;sum+=gray[i];squares+=gray[i]**2;
    if(x>0&&x<width-1&&y>0&&y<height-1&&[i-1,i+1,i-width,i+width].every(n=>selected[n])){const l=gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width]-4*gray[i];lap+=l;lap2+=l*l;lapCount++;}
   }
   pixels[j]=keep?source.data[j]:255;pixels[j+1]=keep?source.data[j+1]:255;pixels[j+2]=keep?source.data[j+2]:255;pixels[j+3]=255;
  }
  if(!count||right<left||bottom<top)throw Error(normalizedBox?'No object found in the selected area. Draw a box around the object and retry.':'No object found. Tap the middle of the object and retry.');
  if(cancelled())throw Error('Cancelled.');
  const cropWidth=right-left+1,cropHeight=bottom-top+1;
  const quality:ObjectScan['quality']={width,height,crop:[left,top,cropWidth,cropHeight],maskConfidence:Math.max(0,Math.min(1,scores[best])),maskFraction:count/(width*height),luminance:sum/count,contrast:Math.sqrt(Math.max(0,squares/count-(sum/count)**2)),sharpness:lapCount?Math.max(0,lap2/lapCount-(lap/lapCount)**2):0};
  const prepared=renderObjectCrop(pixels,selected,width,height,[left,top,cropWidth,cropHeight],version);
  return {image:new RawImage(prepared.data,prepared.width,prepared.height,3),quality,foreground:prepared.foreground};
  }
  let clicked=Math.min(height-1,Math.floor(point.y*height))*width+Math.min(width-1,Math.floor(point.x*width));
  const eligible=version===1?[best]:[best,...scores.map((_,i)=>i).filter(i=>i!==best&&(Number(mask[i*width*height+clicked])>0||(normalizedBox&&scores[i]>0.6)))];
  const prepared=eligible.map(index=>prepareMask(index));
  return {...prepared[0],alternatives:prepared.slice(1)};
 } finally {URL.revokeObjectURL(url);}
}
