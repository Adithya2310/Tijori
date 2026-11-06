import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseEvaluationManifest,evaluateObjectDataset,evaluationMetrics,proposeCalibration,type EvaluationRow} from '../lib/object-evaluation.ts';
const [manifestPath,outputDirectory,...options]=process.argv.slice(2);
try {
 if(!manifestPath||!outputDirectory)throw Error('Usage: node --experimental-strip-types scripts/object-evaluate.ts dataset.json output-directory [--target-far 0.01]');
 if((await stat(manifestPath)).size>64_000_000)throw Error('Dataset exceeds the 64 MB input limit.');
 const text=await readFile(manifestPath,'utf8'),manifest=parseEvaluationManifest(JSON.parse(text));
 const rows=evaluateObjectDataset(manifest,(n,total)=>{if(n%100===0)console.error(`${n}/${total} pairs evaluated`);});
 if(options.includes('--require-heldout')&&(!rows.some(r=>r.split==='heldout'&&r.same)||!rows.some(r=>r.split==='heldout'&&!r.same)))throw Error('CI evaluation requires held-out positive and negative physical-instance attempts.');
 const targetIndex=options.indexOf('--target-far');
 const calibration=targetIndex>=0?proposeCalibration(rows,Number(options[targetIndex+1])):null;
 const metricsFor=(subset:EvaluationRow[])=>evaluationMetrics(subset,calibration?.usable?calibration.minimumGlobal:undefined);
 const group=(field:'category'|'angle'|'device'|'reference')=>Object.fromEntries([...new Set(rows.map(r=>r[field]))].map(key=>[key,metricsFor(rows.filter(r=>r[field]===key))]));
 const report={version:1,datasetHash:createHash('sha256').update(text).digest('hex'),samples:manifest.samples.length,physicalObjects:new Set(manifest.samples.map(s=>s.instanceId)).size,policyVersion:'object-review-v2',calibratedForAuthorization:false,calibration,all:metricsFor(rows),bySplit:Object.fromEntries(['development','calibration','heldout'].map(split=>[split,metricsFor(rows.filter(r=>r.split===split))])),byCategory:group('category'),byAngle:group('angle'),byDevice:group('device'),byInstance:group('reference'),sameCategoryNegatives:metricsFor(rows.filter(r=>!r.same&&r.category===r.referenceCategory)),crossCategoryNegatives:metricsFor(rows.filter(r=>!r.same&&r.category!==r.referenceCategory)),baselineNote:'Historical 0.50 rule evaluated on these SAME newly preprocessed features. This is a decision-rule ablation, not a benchmark of the historical image pipeline.',baseline:{falseAccepts:rows.filter(r=>!r.same&&r.baselineMatched).length,falseRejects:rows.filter(r=>r.same&&!r.baselineMatched).length}};
 await mkdir(outputDirectory,{recursive:true});
 await writeFile(join(outputDirectory,'report.json'),JSON.stringify(report,null,2));
 await writeFile(join(outputDirectory,'pairs.json'),JSON.stringify(rows,null,2));
 const hist=Array.from({length:20},(_,i)=>({bin:i/20,same:rows.filter(r=>r.same&&Math.min(19,Math.floor(Math.max(0,r.result.global)*20))===i).length,different:rows.filter(r=>!r.same&&Math.min(19,Math.floor(Math.max(0,r.result.global)*20))===i).length}));
 const peak=Math.max(1,...hist.flatMap(b=>[b.same,b.different]));
 const bars=hist.map((b,i)=>`<rect x="${35+i*27}" y="${180-b.same/peak*150}" width="11" height="${b.same/peak*150}" fill="#216d9b"/><rect x="${47+i*27}" y="${180-b.different/peak*150}" width="11" height="${b.different/peak*150}" fill="#bb493b"/>`).join('');
 const html=`<!doctype html><meta charset="utf-8"><title>Object verification evaluation</title><style>body{font:16px system-ui;max-width:960px;margin:32px auto;padding:16px}pre{white-space:pre-wrap}svg{max-width:100%;height:auto}</style><h1>Object verification evaluation</h1><p>Blue: same instance. Red: wrong instance. Global similarity bins from 0 to 1.</p><svg viewBox="0 0 620 215" role="img" aria-label="Global similarity score distributions">${bars}<text x="30" y="205">0</text><text x="565" y="205">1</text></svg><p>Prototype policy. Correlated trials and small sample counts cannot establish a security guarantee. No runtime policy was changed.</p><pre>${JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;')}</pre>`;
 await writeFile(join(outputDirectory,'report.html'),html);
 console.log(JSON.stringify({outputDirectory,samples:report.samples,objects:report.physicalObjects,metrics:report.all,calibration},null,2));
 const heldoutFalseAccepts=rows.filter(r=>r.split==='heldout'&&!r.same&&r.result.matched).length;
 if(heldoutFalseAccepts){console.error(`Held-out regression: ${heldoutFalseAccepts} wrong-instance attempts were accepted by the current runtime policy.`);process.exitCode=1;}
}catch(error){console.error(error instanceof Error?error.message:'Evaluation failed.');process.exitCode=1;}
