"use strict";
// YURIKA 3.7.0 paired-audio SR/BWE controller trainer.
// Four strategy outputs use fast-softmax. BWE/SR are independent sigmoid drives.
// Runtime cost after training: 60 scalar coefficients, no dataset/audio I/O.
const fs=require('fs'),path=require('path');const root=__dirname;
const TYPES=['tonal','transient','texture','ambience'],K=['harmonic','transient','texture','ambience'];
const source=path.resolve(root,'..','sr-training','audio_sr_training_data.txt');
function parseLine(line){
  const o={};for(const tok of line.trim().split(/\s+/)){const p=tok.indexOf('=');if(p>0)o[tok.slice(0,p)]=tok.slice(p+1);}const num=k=>Number(o[k]);
  const r={split:o.split||'train',origin:o.origin||'unknown',weight:Number.isFinite(num('weight'))?num('weight'):1,type:o.type,
    energy:num('energy'),confidence:num('confidence'),l1:num('l1'),l2:num('l2'),l3:num('l3'),
    target:{harmonic:num('harmonic'),transient:num('transient'),texture:num('texture'),ambience:num('ambience'),bwe:num('bwe'),sr:num('sr')}};
  if(!TYPES.includes(r.type))throw new Error('bad type: '+r.type);
  for(const v of [r.energy,r.confidence,r.l1,r.l2,r.l3,...K.map(k=>r.target[k]),r.target.bwe,r.target.sr])if(!Number.isFinite(v))throw new Error('non-finite training row');
  const sum=K.reduce((s,k)=>s+r.target[k],0);if(!(sum>0))throw new Error('strategy target sum <= 0');for(const k of K)r.target[k]/=sum;
  r.target.bwe=Math.max(0,Math.min(1,r.target.bwe));r.target.sr=Math.max(0,Math.min(1,r.target.sr));r.weight=Math.max(.01,Math.min(4,r.weight));return r;
}
const rows=fs.readFileSync(source,'utf8').split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('#')).map(parseLine);
const enc=r=>[r.energy,r.confidence,r.l1,r.l2,r.l3,...TYPES.map(t=>t===r.type?1:0)];
const stratTgt=r=>K.map(k=>r.target[k]);const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function fastExp(x){x=clamp(x,-7,7);let y=1+x/512;for(let i=0;i<9;i++)y*=y;return y;}
function fastExpD(x){if(x<=-7||x>=7)return 0;let z=clamp(x,-7,7),b=1+z/512;return fastExp(z)/b;}
function sigmoid(z){const q=fastExp(-z);return 1/(1+q);}
let seed=0x3702026;function rnd(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)/4294967296)*2-1;}
const I=9,S=4,C=2;let WS=Array.from({length:S},()=>Array.from({length:I},()=>rnd()*.04)),BS=Array(S).fill(0),WC=Array.from({length:C},()=>Array.from({length:I},()=>rnd()*.04)),BC=Array(C).fill(0);
function forward(x){const zs=WS.map((w,k)=>BS[k]+w.reduce((s,v,i)=>s+v*x[i],0)),q=zs.map(fastExp),sum=q.reduce((a,b)=>a+b,0),strategy=q.map(v=>v/sum);const zc=WC.map((w,k)=>BC[k]+w.reduce((s,v,i)=>s+v*x[i],0));return {zs,q,sum,strategy,zc,controls:zc.map(sigmoid)};}
const train=rows.filter(r=>r.split!=='valid'),valid=rows.filter(r=>r.split==='valid');
for(let epoch=0;epoch<1100;epoch++){
  const gWS=Array.from({length:S},()=>Array(I).fill(0)),gBS=Array(S).fill(0),gWC=Array.from({length:C},()=>Array(I).fill(0)),gBC=Array(C).fill(0);let wsum=0;
  for(const r of train){const x=enc(r),y=stratTgt(r),f=forward(x),wt=r.weight;wsum+=wt;
    const gp=f.strategy.map((v,k)=>wt*2*(v-y[k])/S),dot=gp.reduce((a,v,k)=>a+v*f.q[k],0);
    for(let j=0;j<S;j++){const gq=(gp[j]*f.sum-dot)/(f.sum*f.sum),dz=gq*fastExpD(f.zs[j]);gBS[j]+=dz;for(let i=0;i<I;i++)gWS[j][i]+=dz*x[i];}
    const targets=[r.target.bwe,r.target.sr];for(let j=0;j<C;j++){const p=f.controls[j],risk=(j===0&&targets[j]<.08&&p>targets[j])?2.2:1,dz=wt*risk*2*(p-targets[j])*p*(1-p);gBC[j]+=dz;for(let i=0;i<I;i++)gWC[j][i]+=dz*x[i];}
  }
  const den=Math.max(1,wsum),lr=epoch<260?.34:(epoch<720?.14:.055),wd=8e-7;
  for(let k=0;k<S;k++){BS[k]-=lr*gBS[k]/den;for(let i=0;i<I;i++)WS[k][i]-=lr*(gWS[k][i]/den+wd*WS[k][i]);}
  for(let k=0;k<C;k++){BC[k]-=lr*gBC[k]/den;for(let i=0;i<I;i++)WC[k][i]-=lr*(gWC[k][i]/den+wd*WC[k][i]);}
}
function metrics(set){let sm=0,sa=0,sn=0,bm=0,ba=0,srm=0,sra=0,ws=0;for(const r of set){const f=forward(enc(r)),y=stratTgt(r),wt=r.weight;for(let k=0;k<S;k++){const d=f.strategy[k]-y[k];sm+=wt*d*d;sa+=wt*Math.abs(d);sn+=wt;}let d=f.controls[0]-r.target.bwe;bm+=wt*d*d;ba+=wt*Math.abs(d);d=f.controls[1]-r.target.sr;srm+=wt*d*d;sra+=wt*Math.abs(d);ws+=wt;}return {strategyRmse:Math.sqrt(sm/sn),strategyMae:sa/sn,bweRmse:Math.sqrt(bm/ws),bweMae:ba/ws,srRmse:Math.sqrt(srm/ws),srMae:sra/ws,count:set.length,weightSum:ws};}
const origins=[...new Set(rows.map(r=>r.origin))],byOrigin={};for(const o of origins)byOrigin[o]={train:metrics(train.filter(r=>r.origin===o)),valid:metrics(valid.filter(r=>r.origin===o))};
const m={architecture:'linear-9x4-fastsoftmax + linear-9x2-sigmoid',params:I*S+S+I*C+C,source:path.relative(path.resolve(root,'..'),source),rows:rows.length,train:metrics(train),valid:metrics(valid),byOrigin};
const f=v=>Number(v).toPrecision(9)+'f';const header=`#pragma once\n// Generated from sr-training/audio_sr_training_data.txt by train_controller.js\n#define YURIKA_CONTROLLER_AUDIO_SR_TRAINED 3\nstatic const int YURIKA_CTRL_INPUTS=${I};\nstatic const int YURIKA_CTRL_STRATEGY_OUTPUTS=${S};\nstatic const int YURIKA_CTRL_DRIVE_OUTPUTS=${C};\nstatic const float YURIKA_CTRL_STRATEGY_W[${I*S}]={${WS.flat().map(f).join(',')}};\nstatic const float YURIKA_CTRL_STRATEGY_B[${S}]={${BS.map(f).join(',')}};\nstatic const float YURIKA_CTRL_DRIVE_W[${I*C}]={${WC.flat().map(f).join(',')}};\nstatic const float YURIKA_CTRL_DRIVE_B[${C}]={${BC.map(f).join(',')}};\n`;
fs.writeFileSync(path.join(root,'controller_weights.h'),header);fs.writeFileSync(path.join(root,'controller_weights.json'),JSON.stringify({I,S,C,WS,BS,WC,BC},null,2)+'\n');fs.writeFileSync(path.join(root,'training_metrics.json'),JSON.stringify(m,null,2)+'\n');console.log(JSON.stringify(m));
