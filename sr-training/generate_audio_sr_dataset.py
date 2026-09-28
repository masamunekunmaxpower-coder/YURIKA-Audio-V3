#!/usr/bin/env python3
"""Generate compact paired audio supervision for YURIKA 3.7.0.

The runtime never reads audio or this script. Training rows are derived offline from:
  * procedural 96 kHz ground-truth scenes with real content above 24 kHz;
  * an optional user-supplied 96 kHz recording degraded 96->48->96 kHz.

The paired task teaches two scalar needs in addition to four Soft Sound Object
strategy weights:
  bwe = how strongly missing upper-band synthesis is justified by the pair;
  sr  = how strongly perceptual in-band detail restoration is justified.

No claim is made that pseudo targets are subjective listening ground truth.
"""
from __future__ import annotations
import argparse, json, math, pathlib
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

FS=96000
N=8192
TYPES=("tonal","transient","texture","ambience")
OUTS=("harmonic","transient","texture","ambience")
RNG=np.random.default_rng(0x3702026)


def clip(x): return float(np.clip(x,0.0,1.0))
def rms(x): return float(np.sqrt(np.mean(np.square(x),dtype=np.float64)+1e-20))

def degrade_48k(x):
    y=resample_poly(x,1,2,axis=0,window=('kaiser',8.6))
    z=resample_poly(y,2,1,axis=0,window=('kaiser',8.6))
    if len(z)<len(x): z=np.pad(z,((0,len(x)-len(z)),(0,0)))
    return z[:len(x)].astype(np.float32,copy=False)

def spectrum_energy(x,lo,hi):
    mono=np.mean(x,axis=1)
    w=np.hanning(len(mono)); X=np.fft.rfft(mono*w)
    f=np.fft.rfftfreq(len(mono),1/FS)
    m=(f>=lo)&(f<hi)
    return float(np.sum(np.abs(X[m])**2)+1e-20)

def descriptors(x):
    mono=np.mean(x,axis=1).astype(np.float64)
    rr=rms(mono); pk=float(np.max(np.abs(mono)))
    d=np.diff(mono,prepend=mono[0]); dr=rms(d)
    zcr=float(np.mean((mono[1:]>=0)!=(mono[:-1]>=0))) if len(mono)>1 else 0.0
    side=rms(0.5*(x[:,0]-x[:,1]))/(rr+1e-8) if x.shape[1]>1 else 0.0
    w=np.hanning(len(mono)); mag=np.abs(np.fft.rfft(mono*w))+1e-12
    freq=np.fft.rfftfreq(len(mono),1/FS); use=(freq>=120)&(freq<=20000)
    m=mag[use]
    flat=float(np.exp(np.mean(np.log(m)))/(np.mean(m)+1e-12)) if m.size else 0.0
    centroid=float(np.sum(freq[use]*m)/(np.sum(m)+1e-12)/20000.0) if m.size else 0.0
    crest=pk/(rr+1e-8)
    energy=clip(rr/0.16)
    activity=clip((rr-0.00025)/0.055)
    edge=clip((dr/(rr+1e-8)-0.02)/0.75)
    trans=clip((crest-1.35)/5.0)*0.55+edge*0.45; trans=clip(trans)
    crossing=clip(zcr*5.0)
    tonal=clip((1-flat)*0.72+(1-crossing)*0.18+(1-trans)*0.10)
    texture=clip(flat*0.62+crossing*0.22+edge*0.16)
    ambience=clip((1-trans)*0.48+clip(side)*0.28+(1-edge)*0.24)
    l1=clip(activity*(0.52*edge+0.30*trans+0.18*crossing))
    l2=clip(activity*(0.44*tonal+0.24*(1-flat)+0.18*energy+0.14*(1-abs(centroid-.45))))
    l3=clip(activity*(0.46*ambience+0.24*(1-trans)+0.18*clip(side)+0.12*(1-edge)))
    scores=np.array([tonal,trans,texture,ambience],dtype=np.float64)+1e-5
    scores/=scores.sum()
    typ=TYPES[int(np.argmax(scores))]
    confidence=clip(activity*(0.55+0.45*(float(np.max(scores))-float(np.partition(scores,-2)[-2]))*2.5))
    return dict(energy=energy,confidence=confidence,l1=l1,l2=l2,l3=l3,type=typ,scores=scores.tolist(),flatness=flat,centroid=centroid,edge=edge,transient=trans,side=clip(side))

def targets(truth,degraded,d,known_type=None):
    # Ground-truth energy above the 48 kHz source Nyquist is direct supervision.
    hf=spectrum_energy(truth,24000,46000); upper=spectrum_energy(truth,12000,24000)
    hf_ratio=hf/(upper+1e-20)
    bwe=clip(0.45*math.sqrt(max(0.0,hf_ratio)))
    # Pairwise error in the audible-detail band informs perceptual SR demand.
    err=truth-degraded
    eerr=spectrum_energy(err,5000,20000); eref=spectrum_energy(truth,5000,20000)
    rel=math.sqrt(max(0.0,eerr/(eref+1e-20)))
    sr=clip(0.12+0.52*rel+0.20*d['edge']+0.16*d['transient'])
    base=np.array(d['scores'],dtype=np.float64)
    if known_type in TYPES:
        prior=np.full(4,.08,dtype=np.float64); prior[TYPES.index(known_type)]=.76
        base=.62*prior+.38*base
    # Hierarchy shapes the strategy but does not redefine the paired targets.
    h=np.array([d['l2']+.18*d['l3'], d['l1']+.12*d['l2'], .55*d['l1']+.35*d['l2'], d['l3']+.10*d['l2']])
    base=.78*base+.22*(h/(h.sum()+1e-12)); base/=base.sum()
    return base,bwe,sr,hf_ratio,rel

def normalize_scene(x):
    peak=float(np.max(np.abs(x)))
    if peak>1e-9: x=x*(0.34/peak)
    return x.astype(np.float32)

def synth_scene(kind):
    n=N; t=np.arange(n)/FS
    if kind=='tonal':
        f0=float(RNG.uniform(180,1450)); mono=np.zeros(n)
        ph=float(RNG.uniform(0,2*np.pi));
        for k in range(1,int(46000//f0)+1):
            amp=(1/(k**1.08))*float(RNG.uniform(.75,1.15)); mono+=amp*np.sin(2*np.pi*f0*k*t+ph*k+RNG.uniform(-.12,.12))
        env=.72+.28*np.sin(2*np.pi*RNG.uniform(.5,4)*t+RNG.uniform(0,6.2)); mono*=env
        side=.018*np.sin(2*np.pi*min(44000,f0*3.07)*t+1.1)
    elif kind=='transient':
        mono=np.zeros(n); side=np.zeros(n)
        for _ in range(int(RNG.integers(2,6))):
            pos=int(RNG.integers(0,n-600)); L=min(n-pos,int(RNG.integers(160,900))); tt=np.arange(L)/FS
            fc=float(RNG.uniform(2500,15000)); env=np.exp(-tt*RNG.uniform(140,900));
            burst=(np.sin(2*np.pi*fc*tt)+.45*RNG.standard_normal(L))*env
            mono[pos:pos+L]+=burst; side[pos:pos+L]+=.25*RNG.standard_normal(L)*env
    elif kind=='texture':
        noise=RNG.standard_normal(n); d=np.diff(noise,prepend=noise[0]); mono=.58*noise+.42*d
        # Add a weak modulated carrier so the truth is not just white noise.
        mono+=.18*np.sin(2*np.pi*RNG.uniform(6000,15000)*t)*(0.5+0.5*np.sin(2*np.pi*RNG.uniform(4,18)*t))
        side=.25*RNG.standard_normal(n)
    else:
        src=RNG.standard_normal(n)*.22
        mono=np.zeros(n); side=np.zeros(n)
        delays=[0,113,271,487,733,1091]; gains=[1,.62,.47,.33,.23,.15]
        for de,g in zip(delays,gains):
            if de<n: mono[de:]+=g*src[:n-de]
        side=.18*np.roll(src,37)-.13*np.roll(src,91)
        env=np.exp(-t*RNG.uniform(1.5,5.0)); mono*=env; side*=env
    L=mono+side; R=mono-side
    return normalize_scene(np.stack([L,R],axis=1))

def row_text(split,origin,weight,d,strategy,bwe,sr,extra=''):
    vals=' '.join(f'{k}={d[k]:.6f}' for k in ('energy','confidence','l1','l2','l3'))
    st=' '.join(f'{OUTS[i]}={strategy[i]:.6f}' for i in range(4))
    return f"split={split} origin={origin} weight={weight:.3f} type={d['type']} {vals} {st} bwe={bwe:.6f} sr={sr:.6f}{extra}"

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--real-audio'); ap.add_argument('--out',required=True); ap.add_argument('--summary',required=True)
    ap.add_argument('--synthetic-per-type',type=int,default=300); ap.add_argument('--real-rows',type=int,default=600)
    a=ap.parse_args(); rows=[]; stats={'version':'3.7.0','fs':FS,'windowFrames':N,'targets':['harmonic','transient','texture','ambience','bwe','sr'],'origins':{}}
    syn=[]
    for kind in TYPES:
        for j in range(a.synthetic_per_type):
            truth=synth_scene(kind); deg=degrade_48k(truth); d=descriptors(deg); d['type']=kind
            st,bwe,sr,hfr,rel=targets(truth,deg,d,kind); split='valid' if j%5==0 else 'train'
            syn.append((bwe,sr,hfr,rel)); rows.append(row_text(split,'paired_synthetic_96to48to96',1.0,d,st,bwe,sr,f' hfRatio={hfr:.7g} pairError={rel:.7g}'))
    stats['origins']['paired_synthetic_96to48to96']={'rows':len(syn),'meanBwe':float(np.mean([x[0] for x in syn])),'meanSr':float(np.mean([x[1] for x in syn])),'meanHfRatio':float(np.mean([x[2] for x in syn]))}
    if a.real_audio:
        info=sf.info(a.real_audio)
        if info.samplerate!=FS: raise SystemExit(f'real audio must be {FS} Hz, got {info.samplerate}')
        vals=[]; total=info.frames; margin=N+64
        # Time-block split: last 20% is held out, avoiding random neighboring-window leakage.
        positions=np.linspace(0,max(0,total-margin),a.real_rows,dtype=np.int64)
        with sf.SoundFile(a.real_audio) as f:
            for j,pos in enumerate(positions):
                f.seek(int(pos)); truth=f.read(N,dtype='float32',always_2d=True)
                if len(truth)<N: truth=np.pad(truth,((0,N-len(truth)),(0,0)))
                if truth.shape[1]>2: truth=truth[:,:2]
                elif truth.shape[1]==1: truth=np.repeat(truth,2,axis=1)
                deg=degrade_48k(truth); d=descriptors(deg); st,bwe,sr,hfr,rel=targets(truth,deg,d,None)
                split='valid' if pos>=int(total*.80) else 'train'
                vals.append((bwe,sr,hfr,rel)); rows.append(row_text(split,'real_selfsupervised_96to48to96',1.0,d,st,bwe,sr,f' hfRatio={hfr:.7g} pairError={rel:.7g}'))
        stats['origins']['real_selfsupervised_96to48to96']={'rows':len(vals),'sourceFrames':int(total),'durationSeconds':float(total/FS),'meanBwe':float(np.mean([x[0] for x in vals])),'meanSr':float(np.mean([x[1] for x in vals])),'meanHfRatio':float(np.mean([x[2] for x in vals]))}
    out=pathlib.Path(a.out); out.parent.mkdir(parents=True,exist_ok=True)
    header=[
      '# YURIKA Audio 3.7.0 paired bandwidth-extension + perceptual-SR controller corpus',
      '# Offline-only training source. Runtime uses only the generated 60 controller coefficients.',
      '# paired_synthetic rows contain known 96 kHz energy above 24 kHz; real rows use 96->48->96 self-supervision.',
      '# bwe/sr are bounded engineering targets, not claims of subjective listening quality or exact source restoration.',
      '# Fields after sr are diagnostics and are ignored by the runtime trainer.'
    ]
    out.write_text('\n'.join(header+rows)+'\n',encoding='utf-8')
    stats['rows']=len(rows); stats['trainRows']=sum('split=train ' in r for r in rows); stats['validRows']=len(rows)-stats['trainRows']
    pathlib.Path(a.summary).write_text(json.dumps(stats,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(stats))
if __name__=='__main__': main()
