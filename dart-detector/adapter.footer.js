;(() => {
  const c=x=>x<0?0:(x>1?1:x),T=['tonal','transient','texture','ambience'];
  globalThis.YurikaDartDetectorRuntime=Object.freeze({create:()=>({process(m={}){
    const a=globalThis.yurikaDartDetectorProcess(Number(m.rms)||0,Number(m.peak)||0,Number(m.diffRms)||0,Number(m.zeroCrossRate)||0,Number(m.sideRatio)||0,Number(m.sampleRate)||96000,Number(m.frames)||512);
    const l1=c(Number(a[0])||0),l2=c(Number(a[1])||0),l3=c(Number(a[2])||0),w1=c(Number(a[3])||0),w2=c(Number(a[4])||0),w3=c(Number(a[5])||0),confidence=c(Number(a[6])||0),dominantMargin=c(Number(a[7])||0),dominantIndex=Number(a[8])||2,sequence=Number(a[9])||0;
    const softObjects=[];for(let i=0;i<4;i++){const b=10+i*6,type=T[Math.max(0,Math.min(3,Number(a[b])|0))];softObjects.push({objectId:i+1,type,energy:c(Number(a[b+1])||0),confidence:c(Number(a[b+2])||0),hierarchy:{l1:c(Number(a[b+3])||0),l2:c(Number(a[b+4])||0),l3:c(Number(a[b+5])||0)}});}
    return {l1,l2,l3,hierarchyWeights:{l1:w1,l2:w2,l3:w3},objects:[{index:1,score:l1,weight:w1,role:"micro"},{index:2,score:l2,weight:w2,role:"local"},{index:3,score:l3,weight:w3,role:"context"}],dominantIndex,dominantMargin,confidence,sequence,softObjects,source:"dart2js-rule-detector-v2.1"};
  },reset(){globalThis.yurikaDartDetectorReset?.();}})});
})();