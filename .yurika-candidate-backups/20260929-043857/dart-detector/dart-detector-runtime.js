"use strict";
// YURIKA Soft Sound Object detector v2.1.0 browser mirror.
// Pure arithmetic, no learned weights. Mirrors detector.dart because Dart SDK is optional at release build time.
(()=>{const c=x=>x<0?0:(x>1?1:x),alpha=(dt,tau)=>1-Math.exp(-dt/tau);
class D{
 constructor(){this.reset()}
 reset(){this.fast=[0,0,0,0];this.local=[0,0,0,0];this.context=[0,0,0,0];this.weights=[1/3,1/3,1/3];this.dominant=2;this.lastCandidate=2;this.candidateStreak=0;this.sequence=0}
 process(m={}){
  const r=Number.isFinite(+m.rms)?Math.max(0,+m.rms):0,p=Number.isFinite(+m.peak)?Math.max(0,+m.peak):0,d=Number.isFinite(+m.diffRms)?Math.max(0,+m.diffRms):0,z=Number.isFinite(+m.zeroCrossRate)?c(+m.zeroCrossRate):0,s=Number.isFinite(+m.sideRatio)?c(+m.sideRatio):0;
  const activity=c((r-.0004)/.018),crest=r>1e-7?p/r:0,transient=c((crest-1.25)/3.75),edge=c((d/Math.max(1e-6,r))*.65),crossing=c(z*2.4),level=c(r*9);
  const sr=Number.isFinite(+m.sampleRate)?Math.max(8000,+m.sampleRate):96000,frames=Number.isFinite(+m.frames)?Math.max(1,+m.frames):512,dt=Math.max(1e-5,Math.min(.25,frames/sr));
  const af=alpha(dt,.045),al=alpha(dt,.22),ac=alpha(dt,1.8),ins=[level,edge,transient,crossing];
  for(let i=0;i<4;i++){this.fast[i]+=(ins[i]-this.fast[i])*af;this.local[i]+=(ins[i]-this.local[i])*al;this.context[i]+=(ins[i]-this.context[i])*ac;}
  const novelty=c(.34*Math.abs(level-this.local[0])*3+.28*Math.abs(edge-this.local[1])*2.2+.22*Math.abs(transient-this.local[2])*2+.16*Math.abs(crossing-this.local[3])*2);
  const localChange=c(.45*Math.abs(this.local[0]-this.context[0])*3.2+.30*Math.abs(this.local[1]-this.context[1])*2.4+.15*Math.abs(this.local[2]-this.context[2])*2+.10*Math.abs(this.local[3]-this.context[3])*2);
  const localAgree=c(1-(.45*Math.abs(edge-this.local[1])+.30*Math.abs(transient-this.local[2])+.25*Math.abs(crossing-this.local[3]))*1.8);
  const contextStability=c(1-(.45*Math.abs(this.local[0]-this.context[0])+.30*Math.abs(this.local[1]-this.context[1])+.15*Math.abs(this.local[2]-this.context[2])+.10*Math.abs(this.local[3]-this.context[3]))*1.6);
  const l1=activity*c(.34*edge+.24*transient+.14*crossing+.28*novelty),l2=activity*c(.30*this.local[1]+.18*this.local[3]+.27*localAgree+.25*localChange),l3=activity*c(.34*this.context[0]+.18*(1-this.context[2])+.16*(1-this.context[3])+.32*contextStability)*(1-.18*s);
  const score=[1.5*l1,l2,.38*l3],mx=Math.max(...score),q=score.map(v=>Math.exp(Math.max(-8,Math.min(0,(v-mx)*5)))),qs=q[0]+q[1]+q[2],target=q.map(v=>v/qs),aw=alpha(dt,.045);
  let ws=0;for(let i=0;i<3;i++){this.weights[i]+=(target[i]-this.weights[i])*aw;this.weights[i]=Math.max(1e-6,this.weights[i]);ws+=this.weights[i];}for(let i=0;i<3;i++)this.weights[i]/=ws;
  let candidate=0;if(this.weights[1]>this.weights[candidate])candidate=1;if(this.weights[2]>this.weights[candidate])candidate=2;const sorted=[...this.weights].sort((a,b)=>a-b),margin=sorted[2]-sorted[1],candidateIndex=candidate+1;
  if(candidateIndex!==this.dominant&&margin>=.025){if(candidateIndex===this.lastCandidate)this.candidateStreak++;else{this.lastCandidate=candidateIndex;this.candidateStreak=1}if(this.candidateStreak>=5){this.dominant=candidateIndex;this.candidateStreak=0}}else{this.lastCandidate=candidateIndex;this.candidateStreak=0}
  const separation=c(margin/.22),confidence=c(activity*(.65+.35*separation));
  const tonal=c(activity*(.46*(1-crossing)+.22*(1-transient)+.18*localAgree+.14*this.weights[1])),tr=c(activity*(.50*transient+.34*edge+.16*this.weights[0])),texture=c(activity*(.40*crossing+.28*edge+.18*novelty+.14*this.weights[0])),ambience=c(activity*(.34*this.weights[2]+.22*(1-transient)+.18*(1-crossing)+.14*s+.12*contextStability));
  const obj=(objectId,type,e,a,b,q)=>({objectId,type,energy:c(level*(.35+.65*e)),confidence:c(confidence*(.4+.6*e)),hierarchy:{l1:c(a),l2:c(b),l3:c(q)}});
  const softObjects=[obj(1,'tonal',tonal,.20*this.weights[0]+.25*tonal,.55*this.weights[1]+.35*tonal,.45*this.weights[2]+.30*tonal),obj(2,'transient',tr,.72*this.weights[0]+.28*tr,.58*this.weights[1]+.26*tr,.32*this.weights[2]+.12*tr),obj(3,'texture',texture,.58*this.weights[0]+.34*texture,.50*this.weights[1]+.34*texture,.38*this.weights[2]+.22*texture),obj(4,'ambience',ambience,.20*this.weights[0]+.14*ambience,.42*this.weights[1]+.24*ambience,.70*this.weights[2]+.30*ambience)];
  this.sequence++;const hierarchyWeights={l1:this.weights[0],l2:this.weights[1],l3:this.weights[2]},objects=[{index:1,score:l1,weight:this.weights[0],role:'micro'},{index:2,score:l2,weight:this.weights[1],role:'local'},{index:3,score:l3,weight:this.weights[2],role:'context'}];
  return {l1,l2,l3,objects,hierarchyWeights,dominantIndex:this.dominant,dominantMargin:margin,confidence,sequence:this.sequence,softObjects,source:'dart-soft-object-detector-v2.1'};
 }}
globalThis.YurikaDartDetectorRuntime=Object.freeze({create:()=>new D()});})();
