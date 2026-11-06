import { compareDinoFeatures, compareCompactDinoFeatures, DINO_THRESHOLD, type DinoFeatures } from './dino.ts';
import { packObjectProfile, unpackObjectProfile, objectProfileViews, validObjectProfile, type ObjectProfile, type SingleObjectProfile } from './object-profile.ts';
import { compareObjectDetails } from './object-detail.ts';
import { scanQualityReason } from './object-scan.ts';

// Shared by login, approval checks and the on-device diagnostic page. No key,
// camera image or server state is needed to evaluate a reference and fresh scan.
export function compareObjectScan(reference: DinoFeatures, photo: DinoFeatures, profile?: ObjectProfile, recordedCandidate?:SingleObjectProfile) {
 if(profile&&!validObjectProfile(profile))throw Error('Invalid or incompatible object reference.');
 // Offline datasets can retain the exact compact candidate instead of raw
 // pixels or megabytes of full tokens. Live login always packs its fresh scan.
 if(recordedCandidate&&!validObjectProfile(recordedCandidate))throw Error('Invalid recorded candidate.');
 const candidateProfile = recordedCandidate ?? packObjectProfile(photo);
 const views=(profile?objectProfileViews(profile):[{profile:packObjectProfile(reference),scan:reference.scan}]).map(view=>({...view,scan:view.scan??reference.scan}));
 const strict=profile?.version===2||!!reference.scan;
 const reason= strict ? !photo.scan?'missing_scan_evidence':scanQualityReason(photo.scan) : null;
 const results=views.map((view,index)=>{
  const similarity=profile?compareCompactDinoFeatures(unpackObjectProfile(view.profile),unpackObjectProfile(candidateProfile)):compareDinoFeatures(reference,photo);
  const detail=compareObjectDetails(view.profile,candidateProfile,strict?view.scan:undefined,strict?photo.scan:undefined);
  let decision:'MATCH'|'REJECT'|'RETRY'='REJECT',decisionReason='different_object';
  if(reason){decision=reason==='person_not_supported'?'REJECT':'RETRY';decisionReason=reason;}
  else if(strict&&view.scan&&photo.scan&&view.scan.category.label!==photo.scan.category.label){decisionReason='different_category';}
  else if(strict&&view.scan?.imageId===photo.scan?.imageId){decision='RETRY';decisionReason='fresh_capture_required';}
  else if(similarity.global<DINO_THRESHOLD||similarity.agreement<DINO_THRESHOLD){decisionReason='global_or_patch_mismatch';}
  else if(!detail.sufficientDetail){decision='RETRY';decisionReason='insufficient_distinctive_detail';}
  else if(!detail.geometryPass){decision='RETRY';decisionReason='no_geometric_overlap';}
  else if(similarity.matched&&detail.matched){decision='MATCH';decisionReason='corroborated_visual_evidence';}
  return {...similarity,detail,matched:decision==='MATCH',decision,reason:decisionReason,view:index};
 });
 // Shortlist on global features, but select only a view that passes EVERY gate.
 // Never average unrelated viewpoints or allow the best CLS to override a failure.
 const best=[...results].sort((a,b)=>Number(b.matched)-Number(a.matched)||b.detail.coverage-a.detail.coverage||b.global-a.global)[0];
 return {...best,thresholdVersion:'object-review-v2',calibrated:false,sourceImageId:views[best.view].scan?.imageId??null,candidateImageId:photo.scan?.imageId??null,views:results};
}
