import { SamModel, AutoProcessor, RawImage, type SamProcessor } from '@huggingface/transformers';
export const SAM_MODEL='Xenova/slimsam-77-uniform';
export const SAM_REVISION='5850ab45f587c112167512ffef949107115e26a0';
export type ObjectPoint={x:number;y:number};
let model:ReturnType<typeof SamModel.from_pretrained>|undefined;
let processor:ReturnType<typeof AutoProcessor.from_pretrained>|undefined;
export async function isolateObject(blob:Blob,point:ObjectPoint,progress:(message:string)=>void,cancelled:()=>boolean):Promise<Blob>{
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.x>1||point.y<0||point.y>1)throw Error('Tap inside the object photo.');
 progress('Loading object isolation on this device…');
 model??=SamModel.from_pretrained(SAM_MODEL,{revision:SAM_REVISION,device:'wasm',dtype:'q8'}).catch(e=>{model=undefined;throw e});
 processor??=AutoProcessor.from_pretrained(SAM_MODEL,{revision:SAM_REVISION}).catch(e=>{processor=undefined;throw e});
 const [sam,preprocess]=await Promise.all([model,processor]);
 if(cancelled())throw Error('Cancelled.');
 const url=URL.createObjectURL(blob);
 try{
  let image=await RawImage.fromURL(url);
  const scale=Math.min(1,768/Math.max(image.width,image.height));
  if(scale<1)image=await image.resize(Math.round(image.width*scale),Math.round(image.height*scale));
  image=image.rgba();
  const inputs=await preprocess(image,{input_points:[[[point.x*image.width,point.y*image.height]]]});
  progress('Removing the background on this device…');
  const output=await sam(inputs);
  const masks=await (preprocess as SamProcessor).post_process_masks(output.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
  const scores=Array.from(output.iou_scores.data as Float32Array);
  const best=scores.indexOf(Math.max(...scores));
  const mask=masks[0].data as Uint8Array;
  const {width,height}=image,offset=best*width*height;
  let left=width,top=height,right=-1,bottom=-1;
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=y*width+x,j=i*4,keep=!!mask[offset+i];
   if(keep){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   pixels[j]=keep?image.data[j]:255;pixels[j+1]=keep?image.data[j+1]:255;pixels[j+2]=keep?image.data[j+2]:255;pixels[j+3]=255;
  }
  if(right<left||bottom<top)throw Error('No object found. Tap the middle of the object and try again.');
  if(cancelled())throw Error('Cancelled.');
  const canvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):Object.assign(document.createElement('canvas'),{width,height});
  const context=canvas.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;
  if(!context)throw Error('Image processing is unavailable.');
  context.putImageData(new ImageData(pixels,width,height),0,0);
  const cropped=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(right-left+1,bottom-top+1):Object.assign(document.createElement('canvas'),{width:right-left+1,height:bottom-top+1});
  const target=cropped.getContext('2d') as CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D|null;
  if(!target)throw Error('Image processing is unavailable.');
  target.drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
  return typeof OffscreenCanvas!=='undefined'&&cropped instanceof OffscreenCanvas?await cropped.convertToBlob({type:'image/png'}):await new Promise<Blob>((resolve,reject)=>(cropped as HTMLCanvasElement).toBlob(value=>value?resolve(value):reject(Error('Could not isolate image.')),'image/png'));
 }finally{URL.revokeObjectURL(url)}
}
