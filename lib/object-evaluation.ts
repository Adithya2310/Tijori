import { validObjectProfile, unpackObjectProfile, multiProfileFromViews, type SingleObjectProfile } from './object-profile.ts';
import { validObjectScan, type ObjectScan } from './object-scan.ts';
import { compareObjectScan } from './object-verification.ts';

export type EvaluationSample={id:string;instanceId:string;category:string;angle:string;device:string;session:string;split:'development'|'calibration'|'heldout';role:'enrollment'|'query';profile:SingleObjectProfile;scan:ObjectScan};
export type EvaluationManifest={version:1;samples:EvaluationSample[]};
export type EvaluationRow={reference:string;query:string;category:string;referenceCategory:string;angle:string;device:string;session:string;split:EvaluationSample['split'];same:boolean;result:ReturnType<typeof compareObjectScan>;baselineMatched:boolean};

export function parseEvaluationManifest(input:unknown):EvaluationManifest {
 const manifest=input as EvaluationManifest;
 if(!manifest||manifest.version!==1||!Array.isArray(manifest.samples)||!manifest.samples.length||manifest.samples.length>2000)throw Error('Expected a versioned evaluation manifest with 1–2000 compact samples.');
 const splits=new Map<string,string>(),ids=new Set<string>(),images=new Set<string>();
 for(const s of manifest.samples) {
  if(!s||![s.id,s.instanceId,s.category,s.angle,s.device,s.session].every(v=>typeof v==='string'&&v.trim().length>0&&v.length<=120)||!['development','calibration','heldout'].includes(s.split)||!['enrollment','query'].includes(s.role)||!validObjectProfile(s.profile)||s.profile.version!==1||!validObjectScan(s.scan))throw Error('Invalid evaluation sample or incompatible model/preprocessing.');
  if(ids.has(s.id)||images.has(s.scan.imageId))throw Error('Repeated sample/image creates dataset leakage.');
  if(splits.has(s.instanceId)&&splits.get(s.instanceId)!==s.split)throw Error('A physical object identity occurs in multiple dataset splits.');
  ids.add(s.id);images.add(s.scan.imageId);splits.set(s.instanceId,s.split);
 }
 return manifest;
}

export function evaluateObjectDataset(manifest:EvaluationManifest,onProgress?:(completed:number,total:number)=>void):EvaluationRow[] {
 const templates=new Map<string,EvaluationSample[]>();
 for(const s of manifest.samples.filter(s=>s.role==='enrollment'))templates.set(s.instanceId,[...(templates.get(s.instanceId)??[]),s]);
 const rows:EvaluationRow[]=[];
 const total=[...templates.values()].reduce((sum,refs)=>sum+manifest.samples.filter(s=>s.role==='query'&&s.split===refs[0].split).length,0);
 for(const [instance,refs] of templates) {
  if(refs.length<4||refs.length>8)throw Error('Every enrolled physical object needs four to eight views.');
  // Reuse original compact bytes. Re-pooling a decoded reference is incorrect.
  const profile=multiProfileFromViews(refs.map(s=>({data:s.profile.data,scan:s.scan})));
  const reference=unpackObjectProfile(profile);
  for(const query of manifest.samples.filter(s=>s.role==='query'&&s.split===refs[0].split)) {
   const result=compareObjectScan(reference,{...unpackObjectProfile(query.profile),scan:query.scan},profile,query.profile);
   rows.push({reference:instance,query:query.instanceId,category:query.category,referenceCategory:refs[0].category,angle:query.angle,device:query.device,session:query.session,split:query.split,same:instance===query.instanceId,result,baselineMatched:result.views.some(view=>view.score>=0.5)});
   onProgress?.(rows.length,total);
  }
 }
 if(!rows.length)throw Error('Dataset contains no enrollment/query pairs in the same split.');
 return rows;
}

export function evaluationMetrics(rows:EvaluationRow[],minimumGlobal?:number) {
 const accepts=(r:EvaluationRow)=>r.result.decision==='MATCH'&&(minimumGlobal===undefined||r.result.global>=minimumGlobal);
 const negative=rows.filter(r=>!r.same),positive=rows.filter(r=>r.same);
 const falseAccepts=negative.filter(accepts).length,trueAccepts=positive.filter(accepts).length;
 const falseRejects=positive.filter(r=>r.result.decision==='REJECT'||r.result.decision==='MATCH'&&!accepts(r)).length;
 const retries=rows.filter(r=>r.result.decision==='RETRY').length;
 const ratio=(n:number,d:number)=>d?n/d:null;
 const interval=(n:number,d:number)=>{
  if(!d)return null;const z=1.959963984540054,p=n/d,denominator=1+z*z/d,center=(p+z*z/(2*d))/denominator,margin=z*Math.sqrt(p*(1-p)/d+z*z/(4*d*d))/denominator;
  return {lower:Math.max(0,center-margin),upper:Math.min(1,center+margin),assumption:'independent binomial trials; correlated captures violate this assumption'};
 };
 const uniquePairs=new Set(negative.map(r=>[r.reference,r.query].sort().join('\0'))).size;
 return {trials:rows.length,negativeTrials:negative.length,positiveTrials:positive.length,uniqueNegativeInstancePairs:uniquePairs,falseAccepts,trueAccepts,falseRejects,retries,falseAcceptRate:ratio(falseAccepts,negative.length),trueAcceptRate:ratio(trueAccepts,positive.length),falseRejectRate:ratio(falseRejects,positive.length),retryRate:ratio(retries,rows.length),falseAcceptInterval95:interval(falseAccepts,negative.length),falseRejectInterval95:interval(falseRejects,positive.length),zeroErrorUpperBound95AssumingIndependentTrials:falseAccepts===0&&negative.length?1-Math.pow(0.05,1/negative.length):null,independenceWarning:'Repeated objects, sessions and devices produce correlated trials; this bound is not an instance-level security guarantee.'};
}

export function proposeCalibration(rows:EvaluationRow[],targetFalseAcceptRate:number) {
 if(!Number.isFinite(targetFalseAcceptRate)||targetFalseAcceptRate<=0||targetFalseAcceptRate>=1)throw Error('Supply an explicit target FAR between zero and one.');
 const calibration=rows.filter(r=>r.split==='calibration');
 if(!calibration.some(r=>r.same)||!calibration.some(r=>!r.same))throw Error('Calibration needs same-instance and wrong-instance attempts on separate calibration identities.');
 const thresholds=[...new Set([0.82,...calibration.map(r=>r.result.global).filter(n=>n>=0.82),1.000001])].sort((a,b)=>a-b);
 const candidates=thresholds.map(minimumGlobal=>({minimumGlobal,metrics:evaluationMetrics(calibration,minimumGlobal)})).filter(c=>(c.metrics.falseAcceptRate??1)<=targetFalseAcceptRate);
 const best=candidates.sort((a,b)=>(b.metrics.trueAcceptRate??0)-(a.metrics.trueAcceptRate??0)||a.minimumGlobal-b.minimumGlobal)[0];
 const requiredIndependentNegatives=Math.ceil(Math.log(0.05)/Math.log(1-targetFalseAcceptRate));
 const hasNontrivialOperatingPoint=!!best&&!!best.metrics.trueAccepts;
 return {policyVersion:'object-review-v2',targetFalseAcceptRate,...best,requiredIndependentNegatives,hasNontrivialOperatingPoint,usable:hasNontrivialOperatingPoint&&best.metrics.uniqueNegativeInstancePairs>=requiredIndependentNegatives,calibratedForAuthorization:false,reviewRequired:true,note:'Candidate tightening of the test policy only. Other gates remain fixed. The sample-size screen is necessary, not sufficient: verify independence and validate frozen settings on held-out physical identities. No runtime policy is automatically changed.'};
}
