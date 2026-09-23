"""Isolated linear M/S model, NOT a browser render or full DSP quality score.
W3C Web Audio 1.13.5 coefficients; HP Q in dB, peaking Q linear.
Reads the actual production JS profile with Node. The v2.2 comparator is frozen.
Run: python tests/audio_quality/selfdap_response_test.py [output.json]
"""
from pathlib import Path
import json, subprocess, sys
import numpy as np
from scipy import signal
ROOT=Path(__file__).resolve().parents[2]
SOURCE='https://www.w3.org/TR/webaudio/#filters-characteristics'
strengths=list(range(5,101,5))
script="require(process.argv[1]);console.log(JSON.stringify("+json.dumps(strengths)+".map(s=>globalThis.YurikaSelfDap.profile(s))));"
profiles=json.loads(subprocess.check_output(['node','-e',script,str(ROOT/'self-dap-core.js')],text=True))

def filt(kind,fc,q,g,sr,f):
    w=2*np.pi*fc/sr; c=np.cos(w); A=10**(g/40)
    alpha=np.sin(w)/(2*q)
    if kind=='hp': b=[(1+c)/2,-(1+c),(1+c)/2]; a=[1+alpha,-2*c,1-alpha]
    else: b=[1+alpha*A,-2*c,1-alpha*A]; a=[1+alpha/A,-2*c,1-alpha/A]
    assert np.max(np.abs(np.roots(a)))<1, 'unstable poles'
    return signal.freqz(b,a,worN=2*np.pi*f/sr)[1]

def transfer(p,sr,f,delay_model):
    h=filt('hp',p['sideHpfHz'],p.get('sideHpfQ',10**(.7/20)),0,sr,f)*filt('peak',6000,.55,p['sideGainDb'],sr,f)
    d=p['sideDelaySeconds']*sr
    if delay_model=='ideal':delay=np.exp(-2j*np.pi*f*d/sr)
    else:
        n=np.floor(d);frac=d-n;z=np.exp(-2j*np.pi*f/sr)
        delay=z**n*((1-frac)+frac*z)
    h*=delay
    return (1+h)/2,(1-h)/2

def db(x):return 20*np.log10(np.maximum(np.abs(x),1e-15))
rows=[]
f=np.geomspace(40,18000,2000)
for sr in [44100,48000,96000]:
    for s,p in zip(strengths,profiles):
        t=s/100;old={'sideHpfHz':20+80*t,'sideHpfQ':10**(.7/20),'sideDelaySeconds':.00004*t,'sideGainDb':2*t}
        assert p['sideDelaySeconds']==0
        for model in ['ideal','linear_interpolation']:
            od,oc=transfer(old,sr,f,model);nd,nc=transfer(p,sr,f,model)
            assert np.max(np.abs(nd+nc-1))<1e-12, 'mono sum changed'
            assert np.max(np.abs(nd))<10**(.6/20), 'excessive direct boost'
            # A clear regression gate on unintentional high-frequency leakage.
            band=f>=6000
            assert np.mean(abs(nc[band])**2)<np.mean(abs(oc[band])**2)
            if s==70:
                points=np.array([63,125,1000,6000,10000,16000])
                d0,c0=transfer(old,sr,points,model);d1,c1=transfer(p,sr,points,model)
                for i,hz in enumerate(points):
                    rows.append({'sample_rate':sr,'strength':s,'delay_model':model,'hz':int(hz),
                       'old_leakage_relative_to_direct_db':float(db(c0/d0)[i]),
                       'new_leakage_relative_to_direct_db':float(db(c1/d1)[i]),
                       'old_direct_db':float(db(d0)[i]),'new_direct_db':float(db(d1)[i])})
report={'scope':'isolated linear M/S response model; excludes nonlinear stages, compressors and device I/O',
    'source':SOURCE,'reference':'v2.2 source: HP=20+80*t,Q=.7dB,delay=.00004*t,presence=2*t dB',
    'sample_rates':[44100,48000,96000],'strengths':strengths,'delay_models':['ideal','linear_interpolation'],
    'configurations':120,'status':'PASS','rows':rows,
    'limits':'Browser delay interpolation may differ. No listening, THD+N, end-to-end latency or full-app PCM measurement. No claim that every frequency improves.'}
if len(sys.argv)>1:Path(sys.argv[1]).write_text(json.dumps(report,indent=2))
print('PASS selfdap_response_test: 120 modeled configurations, stable poles, mono unity, bounded boost, lower mean 6–18kHz cross-channel power')
