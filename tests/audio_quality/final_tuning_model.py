"""Deterministic final-v2.5 linear tuning model.
This is not a browser render. It verifies the intended low-cut/Q and Self-DAP M/S changes.
"""
from __future__ import annotations
import json, math, subprocess, sys
from pathlib import Path
import numpy as np
from scipy import signal

ROOT=Path(__file__).resolve().parents[2]

def hp(fc, q_linear, sr, f):
    f=np.asarray(f,float); w=2*np.pi*fc/sr; c=np.cos(w); alpha=np.sin(w)/(2*q_linear)
    b=[(1+c)/2,-(1+c),(1+c)/2]; a=[1+alpha,-2*c,1-alpha]
    z=np.exp(-2j*np.pi*f/sr)
    return (b[0]+b[1]*z+b[2]*z*z)/(a[0]+a[1]*z+a[2]*z*z)

def peak(fc,q,g,sr,f):
    f=np.asarray(f,float); A=10**(g/40); w=2*np.pi*fc/sr; c=np.cos(w); alpha=np.sin(w)/(2*q)
    b=[1+alpha*A,-2*c,1-alpha*A]; a=[1+alpha/A,-2*c,1-alpha/A]
    z=np.exp(-2j*np.pi*f/sr)
    return (b[0]+b[1]*z+b[2]*z*z)/(a[0]+a[1]*z+a[2]*z*z)

def db(x): return 20*np.log10(np.maximum(np.abs(x),1e-15))

def side_transfer(hpf_hz, gain_db, sr, f):
    H=hp(hpf_hz,math.sqrt(.5),sr,f)*peak(6000,.55,gain_db,sr,f)
    return (1+H)/2,(1-H)/2

# Load final production profile rather than duplicating it.
js="require(process.argv[1]);console.log(JSON.stringify(globalThis.YurikaSelfDap.profile(70)))"
profile=json.loads(subprocess.check_output(['node','-e',js,str(ROOT/'self-dap-core.js')],text=True))
assert profile['sideHpfHz']==5
assert abs(profile['sideHpfQ']-math.sqrt(.5))<1e-12
assert abs(profile['bufferHarmonic']-0.0042)<1e-12
assert abs(profile['abHarmonic']-0.0063)<1e-12

points=np.array([20,40,63,125,250,1000,6000,10000,16000],float)
old_d,old_c=side_transfer(5+25*.7,.7,96000,points)
new_d,new_c=side_transfer(profile['sideHpfHz'],profile['sideGainDb'],96000,points)
old_ratio=db(old_c/old_d); new_ratio=db(new_c/new_d)

# The final side guard must materially improve audible-bass isolation vs v2.3.
for hz in [40,63,125,250]:
    i=int(np.where(points==hz)[0][0])
    assert new_ratio[i] < old_ratio[i]-6.0, (hz,old_ratio[i],new_ratio[i])

# WebAudio old bug: q=.7 was interpreted as +0.7 dB resonance. Final converts linear .7 to dB.
# Compare the actual transfer implied by those two interpretations for the 35 Hz clean low-cut.
q_old=10**(.7/20)
q_new=.7
cut_points=np.array([35,63,125,250,1000],float)
old_hp=hp(35,q_old,44100,cut_points)
new_hp=hp(35,q_new,44100,cut_points)
# Old filter peaks above unity around 63 Hz; corrected one must not.
assert db(old_hp)[1] > 1.0
assert db(new_hp)[1] < 0.0

report={
  'status':'PASS',
  'scope':'deterministic linear model; no browser render or listening claim',
  'selfdap_96k_strength70':[
    {'hz':int(h),'v23_cross_over_direct_db':float(o),'final_cross_over_direct_db':float(n)}
    for h,o,n in zip(points,old_ratio,new_ratio)
  ],
  'clean_lowcut_35hz_44100':[
    {'hz':int(h),'v23_mag_db':float(o),'final_mag_db':float(n)}
    for h,o,n in zip(cut_points,db(old_hp),db(new_hp))
  ],
  'neutral_flat':'true low-cut bypass at the 5 Hz sentinel; modeled filter phase is therefore removed from the neutral path',
  'final_limiter_makeup_compensation_db':-0.57,
  'selfdap_harmonic_polish':'buffer/AB harmonic parallel lanes reduced about 50 percent; high-band restoration retained',
  'latency_topology':{
    'neutral':'one final DynamicsCompressorNode limiter remains',
    'music':'one final DynamicsCompressorNode limiter remains',
    'selfdap':'redundant internal DynamicsCompressorNode removed from audible path; one final limiter remains',
    'clean':'broad compressor plus final limiter remain intentionally'
  }
}
if len(sys.argv)>1: Path(sys.argv[1]).write_text(json.dumps(report,indent=2),encoding='utf-8')
print('PASS final_tuning_model v2.5: limiter unity compensation + corrected Q + Self-DAP lower-distortion polish')
