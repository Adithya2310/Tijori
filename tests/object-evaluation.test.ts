import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEvaluationManifest,evaluateObjectDataset,evaluationMetrics,proposeCalibration,type EvaluationManifest,type EvaluationSample} from '../lib/object-evaluation.ts';
import {packObjectProfile} from '../lib/object-profile.ts';
import {scanFeatures} from './fixtures/object-scan.ts';

function dataset():EvaluationManifest {
 const samples:EvaluationSample[]=[];
 let image=1;
 for(const [instance,offset] of [['bottle-a',0],['bottle-b',64]] as const)for(let view=0;view<5;view++) {
  const features=scanFeatures(image++,'bottle',offset);
  samples.push({id:features.scan.imageId,instanceId:instance,category:'bottle',angle:String(view),device:'synthetic',session:'unit-test',split:'calibration',role:view<4?'enrollment':'query',profile:packObjectProfile(features),scan:features.scan});
 }
 return {version:1,samples};
}

test('all-pairs evaluator reproduces a synthetic identity score matrix and reports retries separately',()=>{
 const data=parseEvaluationManifest(dataset()),rows=evaluateObjectDataset(data);
 assert.equal(rows.length,4);assert.deepEqual(rows.map(r=>[r.reference,r.query,r.result.decision]),[['bottle-a','bottle-a','MATCH'],['bottle-a','bottle-b','REJECT'],['bottle-b','bottle-a','REJECT'],['bottle-b','bottle-b','MATCH']]);
 const metrics=evaluationMetrics(rows);assert.equal(metrics.falseAccepts,0);assert.equal(metrics.trueAccepts,2);assert.equal(metrics.retries,0);
 assert.ok(metrics.zeroErrorUpperBound95AssumingIndependentTrials!>0.7,'two negative trials cannot establish a low FAR');
 const cfg=proposeCalibration(rows,0.01);assert.equal(cfg.hasNontrivialOperatingPoint,true);assert.equal(cfg.usable,false);assert.equal(cfg.requiredIndependentNegatives,299);assert.equal(cfg.calibratedForAuthorization,false);assert.equal(cfg.reviewRequired,true);
});

test('evaluation refuses image reuse, physical-identity split leakage and incomplete templates',()=>{
 const duplicate=dataset();duplicate.samples[1].scan.imageId=duplicate.samples[0].scan.imageId;assert.throws(()=>parseEvaluationManifest(duplicate),/leakage/);
 const leaked=dataset();leaked.samples[0].split='heldout';assert.throws(()=>parseEvaluationManifest(leaked),/multiple dataset splits/);
 const partial=dataset();partial.samples=partial.samples.filter((_,i)=>i!==0);assert.throws(()=>evaluateObjectDataset(partial),/four to eight/);
 assert.throws(()=>proposeCalibration([],0.01),/Calibration needs/);
 assert.throws(()=>proposeCalibration([],0),/explicit target/);
});
