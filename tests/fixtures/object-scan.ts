import { objectFeatures } from './object-features.ts';
import { CATEGORY_MODEL, CATEGORY_REVISION, OBJECT_PREPROCESS_VERSION, type ObjectScan } from '../../lib/object-scan.ts';
import type { DinoFeatures } from '../../lib/dino.ts';

export function scanFeatures(id:number,category:ObjectScan['category']['label']='bottle',offset=0):DinoFeatures & {scan:ObjectScan} {
 return {...objectFeatures(offset),scan:{preprocess:OBJECT_PREPROCESS_VERSION,imageId:id.toString(16).padStart(64,'0'),category:{model:CATEGORY_MODEL,revision:CATEGORY_REVISION,dtype:'fp32',label:category,confidence:0.95,ambiguous:false},quality:{width:400,height:300,crop:[50,25,200,250] as [number,number,number,number],maskConfidence:0.98,maskFraction:0.5,luminance:128,contrast:50,sharpness:100},foreground:Array(32).fill(1)}};
}
