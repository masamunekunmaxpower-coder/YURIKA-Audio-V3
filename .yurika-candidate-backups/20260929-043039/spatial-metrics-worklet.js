class YurikaSpatialMetrics extends AudioWorkletProcessor {
  constructor(){
    super();
    this.size=1024; this.left=new Float32Array(this.size); this.right=new Float32Array(this.size); this.pos=0; this.filled=0;
    // Reuse scratch buffers so diagnostic reporting does not allocate on the AudioWorklet thread.
    this.scratchLeft=new Float32Array(768); this.scratchRight=new Float32Array(768);
    this.blocks=0; this.reportEveryBlocks=30; this.maxLagMs=1.2; this.active=false;
    this.lowL=0;this.lowR=0; this.lowAlpha=Math.exp(-2*Math.PI*700/sampleRate);
    this.port.onmessage=(e)=>{const d=e?.data||{}; if(typeof d.active==="boolean"){const was=this.active;this.active=d.active;if(!was&&this.active){this.pos=0;this.filled=0;this.blocks=0;this.lowL=0;this.lowR=0;}} if(Number.isFinite(d.reportEveryBlocks))this.reportEveryBlocks=Math.max(4,Math.min(96,Math.floor(d.reportEveryBlocks))); if(Number.isFinite(d.maxLagMs))this.maxLagMs=Math.max(.2,Math.min(1.5,d.maxLagMs));};
  }
  process(inputs,outputs){
    const input=inputs[0]; const output=outputs[0];
    if(output?.[0]) output[0].fill(0);
    if(!this.active || !input?.length)return true;
    const L=input[0], R=input[1]||input[0];
    for(let i=0;i<L.length;i++){
      const l=L[i]||0,r=R[i]||0; this.left[this.pos]=l;this.right[this.pos]=r;this.pos=(this.pos+1)%this.size;this.filled=Math.min(this.size,this.filled+1);
      this.lowL=(1-this.lowAlpha)*l+this.lowAlpha*this.lowL; this.lowR=(1-this.lowAlpha)*r+this.lowAlpha*this.lowR;
    }
    this.blocks++;
    if(this.active && this.filled>=512 && this.blocks%this.reportEveryBlocks===0)this.report();
    return true;
  }
  report(){
    // Diagnostics do not need full-rate correlation. Downsample the analysis window
    // to <=24 kHz so 96 kHz playback does not create a large one-quantum CPU spike.
    const stride=Math.max(1,Math.ceil(sampleRate/24000));
    const analysisRate=sampleRate/stride;
    const rawN=Math.min(this.filled,this.size,Math.max(512,Math.min(this.size,Math.round(sampleRate*0.016))));
    const l=this.scratchLeft,r=this.scratchRight;
    let start=(this.pos-rawN+this.size)%this.size;
    let n=0,eL=0,eR=0,lowEL=0,lowER=0,lpL=0,lpR=0;
    const a=Math.pow(this.lowAlpha,stride);
    for(let off=0;off<rawN && n<l.length;off+=stride){
      const idx=(start+off)%this.size,x=this.left[idx],y=this.right[idx];
      l[n]=x;r[n]=y;eL+=x*x;eR+=y*y;
      lpL=(1-a)*x+a*lpL;lpR=(1-a)*y+a*lpR;lowEL+=lpL*lpL;lowER+=lpR*lpR;n++;
    }
    if(n<32)return;
    const rmsL=Math.sqrt(eL/n+1e-15),rmsR=Math.sqrt(eR/n+1e-15); const ildDb=20*Math.log10((rmsL+1e-12)/(rmsR+1e-12));
    const lowIldDb=10*Math.log10((lowEL+1e-12)/(lowER+1e-12));
    const highEL=Math.max(1e-12,eL-lowEL),highER=Math.max(1e-12,eR-lowER),highIldDb=10*Math.log10(highEL/highER);
    const maxLag=Math.max(1,Math.min(Math.floor(analysisRate*this.maxLagMs/1000),Math.floor(n/4)));
    let bestPositive=-2,bestPositiveLag=0,bestAbs=-1,bestAbsSigned=0,bestAbsLag=0;
    for(let lag=-maxLag;lag<=maxLag;lag++){
      let xy=0,xx=0,yy=0; const i0=lag<0?-lag:0, i1=lag>0?n-lag:n;
      for(let i=i0;i<i1;i++){const x=l[i],y=r[i+lag];xy+=x*y;xx+=x*x;yy+=y*y;}
      const c=xy/Math.sqrt(xx*yy+1e-18);
      if(c>bestPositive){bestPositive=c;bestPositiveLag=lag;}
      const ac=Math.abs(c); if(ac>bestAbs){bestAbs=ac;bestAbsSigned=c;bestAbsLag=lag;}
    }
    const itdMs=bestPositiveLag/analysisRate*1000;
    const iacc=Math.max(0,Math.min(1,bestAbs));
    const iaccSigned=Math.max(-1,Math.min(1,bestAbsSigned));
    const iaccLagMs=bestAbsLag/analysisRate*1000;
    const itdNorm=Math.max(-1,Math.min(1,itdMs/.70)); const ildNorm=Math.tanh(ildDb/12); const itdAngle=90*itdNorm,ildAngle=90*ildNorm;
    const cueErrorDeg=Math.min(180,Math.abs(itdAngle-ildAngle));
    const lateralizationProxyDeg=Math.max(-90,Math.min(90,(itdAngle+ildAngle)*0.5));
    const positiveCoherence=Math.max(0,Math.min(1,bestPositive));
    const polarityPenalty=iaccSigned<0?Math.min(25,25*Math.abs(iaccSigned)):0;
    const hrtfCueConsistency=Math.max(0,Math.min(100,100-(cueErrorDeg/90)*65-(1-positiveCoherence)*25-polarityPenalty));
    this.port.postMessage({type:"spatial",itdMs,ildDb,lowIldDb,highIldDb,iacc,iaccSigned,iaccLagMs,interauralCoherence:iacc,localizationErrorProxyDeg:cueErrorDeg,lateralizationProxyDeg,hrtfCueConsistency,rmsL,rmsR,analysisRateHz:analysisRate,analysisStride:stride});
  }
}
registerProcessor("yurika-spatial-metrics",YurikaSpatialMetrics);
