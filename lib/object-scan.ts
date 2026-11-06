export const OBJECT_PREPROCESS_VERSION = 'foreground-square-v2' as const;
export const CATEGORY_MODEL = 'Xenova/mobilevit-xx-small';
export const CATEGORY_REVISION = '7dce9340b0bdd8d21f013ebbaa5206979c573ad1';
export type ObjectCategory = 'bottle' | 'pen' | 'watch';
export type ObjectScan = {
 preprocess: typeof OBJECT_PREPROCESS_VERSION;
 imageId: string;
 category: { model: typeof CATEGORY_MODEL; revision: typeof CATEGORY_REVISION; dtype: 'fp32'; label: ObjectCategory | 'unknown' | 'person'; confidence: number; ambiguous: boolean };
 quality: { width: number; height: number; crop: [number,number,number,number]; maskConfidence: number; maskFraction: number; luminance: number; contrast: number; sharpness: number };
 foreground: number[];
};

// Screening policy for the test build. These limits are not a calibrated FAR.
export const SCAN_TEST_POLICY = { maskConfidence: 0.7, minimumMask: 0.005, maximumMask: 0.98, minimumSide: 48, minimumLuminance: 20, maximumLuminance: 235, minimumContrast: 10, minimumSharpness: 12 } as const;

export function validObjectScan(value: unknown): value is ObjectScan {
 if (!value || typeof value !== 'object') return false;
 const s=value as ObjectScan, q=s.quality, c=s.category;
 if(Object.keys(s).sort().join(',')!=='category,foreground,imageId,preprocess,quality'||!q||!c||Object.keys(c).sort().join(',')!=='ambiguous,confidence,dtype,label,model,revision'||Object.keys(q).sort().join(',')!=='contrast,crop,height,luminance,maskConfidence,maskFraction,sharpness,width')return false;
 return s.preprocess===OBJECT_PREPROCESS_VERSION && typeof s.imageId==='string' && /^[a-f0-9]{64}$/.test(s.imageId)
  && !!c && c.model===CATEGORY_MODEL && c.revision===CATEGORY_REVISION && c.dtype==='fp32' && ['bottle','pen','watch','unknown','person'].includes(c.label) && typeof c.ambiguous==='boolean' && Number.isFinite(c.confidence) && c.confidence>=0 && c.confidence<=1
  && !!q && [q.width,q.height].every(n=>Number.isInteger(n)&&n>0&&n<=16384) && Array.isArray(q.crop) && q.crop.length===4 && q.crop.every(n=>Number.isFinite(n)&&n>=0) && q.crop[2]>0 && q.crop[3]>0 && q.crop[0]+q.crop[2]<=q.width && q.crop[1]+q.crop[3]<=q.height
  && [q.maskConfidence,q.maskFraction].every(n=>Number.isFinite(n)&&n>=0&&n<=1) && [q.luminance,q.contrast,q.sharpness].every(n=>Number.isFinite(n)&&n>=0)
  && Array.isArray(s.foreground) && s.foreground.length===32 && s.foreground.every(n=>Number.isFinite(n)&&n>=0&&n<=1);
}

export function scanQualityReason(scan: ObjectScan): string | null {
 if (!validObjectScan(scan)) return 'invalid_scan';
 const q=scan.quality,p=SCAN_TEST_POLICY;
 if(q.maskConfidence<p.maskConfidence) return 'uncertain_mask';
 if(q.maskFraction<p.minimumMask || q.maskFraction>p.maximumMask) return 'object_not_isolated';
 if(Math.min(q.crop[2],q.crop[3])<p.minimumSide) return 'object_too_small';
 if(q.luminance<p.minimumLuminance || q.luminance>p.maximumLuminance) return 'poor_lighting';
 if(q.contrast<p.minimumContrast || q.sharpness<p.minimumSharpness) return 'blur_or_low_detail';
 if(scan.category.label==='person') return 'person_not_supported';
 if(scan.category.label==='unknown' || scan.category.ambiguous) return 'unknown_or_ambiguous_category';
 if(scan.foreground.filter(n=>n>=0.25).length<8) return 'insufficient_foreground';
 return null;
}

export function categoryFromPredictions(predictions: { label: string; score: number }[]): ObjectScan['category'] {
 const group=(label:string):ObjectScan['category']['label'] => /\b(bottle|flask)\b/i.test(label)?'bottle':/\b(ballpoint|fountain pen|quill|pencil)\b/i.test(label)?'pen':/\b(watch|stopwatch)\b/i.test(label)?'watch':/\b(groom|bride|scuba diver|person|human)\b/i.test(label)?'person':'unknown';
 if(!predictions.length || predictions.some(p=>!Number.isFinite(p.score)||p.score<0||p.score>1)) throw Error('Invalid category model output.');
 const sorted=[...predictions].sort((a,b)=>b.score-a.score), label=group(sorted[0].label);
 const confidence=sorted.filter(p=>group(p.label)===label).reduce((sum,p)=>sum+p.score,0);
 // Unknown and conflicting categories never count as an exact-instance match.
 const ambiguous=label==='unknown' || confidence<=0.5 || sorted.slice(0,2).some(p=>group(p.label)!==label&&group(p.label)!=='unknown');
 return {model:CATEGORY_MODEL,revision:CATEGORY_REVISION,dtype:'fp32',label,confidence:Math.min(1,confidence),ambiguous};
}

export function selectObjectCandidate(scans:ObjectScan[]) {
 if(!scans.length)throw Error('No segmented object candidates.');
 const eligible=scans.map((scan,index)=>({scan,index})).filter(option=>!scanQualityReason(option.scan));
 const selected=eligible.sort((a,b)=>b.scan.category.confidence-a.scan.category.confidence||b.scan.quality.maskConfidence-a.scan.quality.maskConfidence)[0]??{scan:scans[0],index:0};
 const conflicting=new Set(eligible.map(option=>option.scan.category.label)).size>1;
 return {...selected,scan:conflicting?{...selected.scan,category:{...selected.scan.category,ambiguous:true}}:selected.scan};
}
