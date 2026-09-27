from pathlib import Path
import json, math
import numpy as np
from scipy.io import wavfile
from scipy import signal
HERE=Path(__file__).resolve().parent; RESULTS=HERE/'results'

def read(path):
    sr,x=wavfile.read(path)
    x=np.asarray(x,float)
    if x.ndim==1:x=np.column_stack([x,x])
    return sr,x[:,:2]

def db(v): return 20*math.log10(max(float(v),1e-15))
def energy_db(v): return 10*math.log10(max(float(v),1e-30))

def fit_rt60(mono,sr,start):
    tail=np.asarray(mono[start:],float)
    e=np.cumsum((tail[::-1]**2))[::-1]+1e-30
    edb=10*np.log10(e/e[0])
    t=np.arange(len(edb))/sr
    def fit(lo,hi,mul):
        m=(edb<=lo)&(edb>=hi)
        if np.count_nonzero(m)<50:return None
        slope,inter=np.polyfit(t[m],edb[m],1)
        return float(-60/slope) if slope<0 else None
    rt=fit(-5,-35,2.0) or fit(-5,-25,3.0) or fit(-5,-15,6.0)
    edt=fit(0,-10,6.0)
    return rt,edt,edb,t

def iacc(seg):
    if len(seg)<8:return 1.0
    L=seg[:,0]-np.mean(seg[:,0]); R=seg[:,1]-np.mean(seg[:,1])
    den=np.sqrt(np.sum(L*L)*np.sum(R*R))+1e-30
    return float(np.sum(L*R)/den)

def main():
    sr,pre=read(RESULTS/'hall.pre.wav'); sr2,post=read(RESULTS/'hall.post.wav'); sr3,final=read(RESULTS/'hall.final.wav')
    assert sr==sr2==sr3
    mono_pre=np.mean(pre,axis=1); mono_post=np.mean(post,axis=1)
    ip=int(np.argmax(np.abs(mono_pre)))
    op=int(np.argmax(np.abs(mono_post[max(0,ip-64):ip+256])))+max(0,ip-64)
    latency=(op-ip)*1000/sr
    rt,edt,edb,t=fit_rt60(mono_post,sr,ip+int(.08*sr))
    early=post[ip:min(len(post),ip+int(.08*sr))]
    late=post[min(len(post),ip+int(.08*sr)):min(len(post),ip+int(1.0*sr))]
    e0=float(np.sum(early*early))+1e-30; e1=float(np.sum(late*late))+1e-30
    c80=10*np.log10(e0/e1)
    peak=float(np.max(np.abs(final)))
    status={}
    sp=RESULTS/'hall.status.json'
    if sp.exists(): status=json.loads(sp.read_text())
    h=status.get('concertHall') or {}
    critical=[]; warnings=[]
    if not np.all(np.isfinite(final)): critical.append('non-finite samples')
    if peak>1.001: critical.append('final clipping > 1.0')
    if abs(latency)>0.25: critical.append('dry direct-path latency > 0.25 ms')
    if rt is None: critical.append('RT60 could not be estimated')
    elif not (1.45<=rt<=2.70): critical.append(f'RT60 outside broad concert-hall guard: {rt:.3f}s')
    if abs(iacc(late))>0.985: warnings.append('late field remains highly correlated')
    target=float(h.get('rt60') or 2.05)
    result={
      'gate':'PASS' if not critical else 'FAIL','critical':critical,'warnings':warnings,'sample_rate':sr,
      'direct_latency_delta_ms':round(latency,4),'target_rt60_s':round(target,3),'measured_rt60_s':None if rt is None else round(rt,3),
      'measured_edt_s':None if edt is None else round(edt,3),'clarity_c80_db':round(float(c80),3),
      'early_iacc':round(iacc(early),5),'late_iacc':round(iacc(late),5),'final_peak_dbfs':round(db(peak),3),
      'runtime_status':h,
      'note':'Objective digital-hall metrics. RT60/EDT/C80/IACC are signal-derived proxies for this synthesized field, not a claim of equivalence to a specific physical concert hall.'
    }
    RESULTS.mkdir(exist_ok=True)
    (RESULTS/'hall-report.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
    md=['# Concert Hall DSP Report','',f"**Gate:** {result['gate']}",'',f"- Target RT60: {result['target_rt60_s']} s",f"- Measured RT60: {result['measured_rt60_s']} s",f"- EDT: {result['measured_edt_s']} s",f"- C80: {result['clarity_c80_db']} dB",f"- Direct-path latency delta: {result['direct_latency_delta_ms']} ms",f"- Early/Late IACC: {result['early_iacc']} / {result['late_iacc']}",f"- Final peak: {result['final_peak_dbfs']} dBFS",'', '> These are objective proxies for the synthesized digital hall. They do not prove equivalence to a named real venue.']
    if warnings: md += ['', 'Warnings:']+[f'- {w}' for w in warnings]
    if critical: md += ['', 'Critical:']+[f'- {c}' for c in critical]
    (RESULTS/'hall-report.md').write_text('\n'.join(md))
    print(json.dumps(result,indent=2,ensure_ascii=False))
    if critical: raise SystemExit(1)
if __name__=='__main__': main()
