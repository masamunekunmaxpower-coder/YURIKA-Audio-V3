from pathlib import Path
import json, math, sys
import numpy as np
import soundfile as sf
from scipy import signal
HERE=Path(__file__).resolve().parent; RESULTS=HERE/'results'; META=json.loads((HERE/'control-debug-metadata.json').read_text())

def rms(x): x=np.asarray(x,float); return float(np.sqrt(np.mean(x*x)+1e-30))
def db20(x): return 20*math.log10(max(float(x),1e-15))
def read(name):
    x,sr=sf.read(RESULTS/name,always_2d=True,dtype='float64'); return x,sr
def sine_seg(x,sr):
    a=META['segments']['sine']['start']+.20; b=META['segments']['sine']['end']-.20; return x[int(a*sr):int(b*sr)]
def fit(x,sr,f=1000):
    if x.ndim==2:x=np.mean(x,axis=1)
    n=len(x);t=np.arange(n)/sr;A=np.column_stack([np.sin(2*np.pi*f*t),np.cos(2*np.pi*f*t),np.ones(n)]);c=np.linalg.lstsq(A,x,rcond=None)[0];y=A@c;return y,rms(y-y.mean()),x-y
def tone_amp(x,sr,f):
    x=np.asarray(x,float);n=len(x);t=np.arange(n)/sr;return float(abs((np.sqrt(2)/n)*np.sum(x*np.exp(-2j*np.pi*f*t))))
def analyze_wav(path):
    x,sr=read(path); x=sine_seg(x,sr); mono=np.mean(x,axis=1); y,fund,res=fit(mono,sr)
    thdn=db20(rms(res)/fund); p=0
    for h in range(2,11):
        if h*1000>=sr*.45: break
        a=tone_amp(mono,sr,h*1000);p+=a*a
    thd=db20(math.sqrt(p)/fund)
    # Near-carrier energy is a direct proxy for slow gain modulation sidebands.
    f,P=signal.periodogram(mono,fs=sr,window='hann',nfft=max(131072,2**int(np.ceil(np.log2(len(mono))))),scaling='spectrum')
    band=(f>=970)&(f<=1030)&((f<998.5)|(f>1001.5)); side=math.sqrt(max(float(np.sum(P[band])),1e-30)); mod=db20(side/fund)
    return {'sample_rate':sr,'thdn_db':round(thdn,3),'thd_db':round(thd,3),'near_carrier_modulation_db':round(mod,3),'rms_dbfs':round(db20(rms(mono)),3)}
def timeline_summary(items):
    if not items:return {}
    def vals(k): return [float(x[k]) for x in items if x.get(k) is not None and isinstance(x.get(k),(int,float))]
    out={}
    for k in ['adaptiveTrimDb','limiterReductionDb','safetyPeak','seamConfidence','transientValleyDepthDb','orbitLevel','orbitActions','selfDapRestorationScore']:
        v=vals(k)
        if v: out[k]={'min':round(min(v),4),'max':round(max(v),4),'span':round(max(v)-min(v),4)}
    out['transientValleyTriggersMax']=max([int(x.get('transientValleyTriggers') or 0) for x in items],default=0)
    out['seamEventsMax']=max([int(x.get('seamEvents') or 0) for x in items],default=0)
    out['restorationActiveSeen']=any(bool(x.get('selfDapRestorationActive')) for x in items)
    out['restorationReasons']=sorted({str(x.get('selfDapRestorationReason')) for x in items if x.get('selfDapRestorationReason')})
    return out

def case(kind,variant):
    prefix=f'debug.{kind}.{variant}'; meta=json.loads((RESULTS/f'{prefix}.json').read_text()); metrics={}
    for tap in meta['tapNames']: metrics[tap]=analyze_wav(f'{prefix}.{tap}.wav')
    return {'variant':variant,'metrics':metrics,'timeline':timeline_summary(meta.get('timeline',[]))}
def main():
    variants={'selfdap':['normal','restoration-off','adaptive-safety-off','seam-valley-off','orbit-off','all-controls-off'],'sonobus':['normal','adaptive-safety-off','seam-valley-off','orbit-off','virtual-amp-off','all-controls-off']}
    report={k:[case(k,v) for v in vs] for k,vs in variants.items()}
    lines=['# YURIKA Adaptive-Control Debug Report','', '> THD+N includes non-harmonic/time-varying residual. THD is harmonic-only; near-carrier modulation estimates slow gain-control sidebands around 1 kHz.','']
    for kind,title in [('selfdap','Self-DAP'),('sonobus','SonoBus Mobile')]:
        lines += [f'## {title} ablation','', '| Variant | Final THD+N dB | Final THD dB | Near-carrier modulation dB |','|---|---:|---:|---:|']
        for c in report[kind]:
            m=c['metrics']['final']; lines.append(f"| {c['variant']} | {m['thdn_db']:.2f} | {m['thd_db']:.2f} | {m['near_carrier_modulation_db']:.2f} |")
        lines.append('')
        normal=report[kind][0]
        if len(normal['metrics'])>1:
            lines += ['### Normal stage taps','', '| Tap | THD+N dB | THD dB | Modulation dB |','|---|---:|---:|---:|']
            for tap,m in normal['metrics'].items(): lines.append(f"| {tap} | {m['thdn_db']:.2f} | {m['thd_db']:.2f} | {m['near_carrier_modulation_db']:.2f} |")
            lines += ['', '### Normal control timeline', '', '```json', json.dumps(normal['timeline'],ensure_ascii=False,indent=2), '```','']
        iso=next((x for x in report[kind] if x['variant']=='all-controls-off'),None)
        if iso and len(iso['metrics'])>1:
            lines += ['### All-controls-off stage taps','', '| Tap | THD+N dB | THD dB | Modulation dB |','|---|---:|---:|---:|']
            for tap,m in iso['metrics'].items(): lines.append(f"| {tap} | {m['thdn_db']:.2f} | {m['thd_db']:.2f} | {m['near_carrier_modulation_db']:.2f} |")
            lines.append('')
    RESULTS.mkdir(parents=True,exist_ok=True); (RESULTS/'adaptive-debug-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8'); md='\n'.join(lines)+'\n';(RESULTS/'adaptive-debug-report.md').write_text(md,encoding='utf-8'); print(md)
if __name__=='__main__': main()
