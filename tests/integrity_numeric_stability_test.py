from __future__ import annotations
import math
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[1]

def fit_thdn(x,fs,f=1000.0):
    x=np.asarray(x,dtype=np.float64)
    t=np.arange(len(x),dtype=np.float64)/fs
    A=np.column_stack((np.sin(2*np.pi*f*t),np.cos(2*np.pi*f*t),np.ones(len(x))))
    c=np.linalg.lstsq(A,x,rcond=None)[0]
    y=A@c
    fund=np.sqrt(np.mean((y-y.mean())**2)+1e-30)
    res=x-y
    return 20*np.log10(np.sqrt(np.mean(res*res)+1e-30)/fund)

def stimulus(fs=96000):
    def fade(x):
        n=int(.01*fs); y=np.asarray(x,dtype=np.float32).copy(); w=np.linspace(0,1,n,dtype=np.float32)
        y[:n]*=w; y[-n:]*=w[::-1]; return y
    t=np.arange(fs,dtype=np.float64)/fs
    f0,f1=20.0,20000.0; k=np.log(f1/f0)
    phase=2*np.pi*f0*(np.exp(k*t)-1)/k
    t2=np.arange(2*fs,dtype=np.float64)/fs
    return np.concatenate((np.zeros(int(.25*fs),np.float32),fade((10**(-18/20))*np.sin(phase)),fade((10**(-12/20))*np.sin(2*np.pi*1000*t2)),np.zeros(int(.25*fs),np.float32)))

def rbj_hp_f32(x,fs,fc=3.5,q=.55):
    w=2*np.pi*fc/fs; alpha=np.sin(w)/(2*q); c=np.cos(w)
    b=np.asarray([(1+c)/2,-(1+c),(1+c)/2],np.float64)/(1+alpha)
    a=np.asarray([1,(-2*c)/(1+alpha),(1-alpha)/(1+alpha)],np.float64)
    b=b.astype(np.float32); a=a.astype(np.float32); x=np.asarray(x,np.float32); y=np.zeros_like(x)
    z1=np.float32(0); z2=np.float32(0)
    for i,xi in enumerate(x):
        yi=b[0]*xi+z1; z1=b[1]*xi-a[1]*yi+z2; z2=b[2]*xi-a[2]*yi; y[i]=yi
    return y

def stable_dc_f32(x,fs,fc=3.5):
    r=np.float32(np.exp(-2*np.pi*fc/fs)); k=np.float32((1+float(r))*.5)
    x=np.asarray(x,np.float32); y=np.zeros_like(x); xp=np.float32(0); yp=np.float32(0)
    for i,xi in enumerate(x):
        yi=k*(xi-xp)+r*yp; y[i]=yi; xp=xi; yp=yi
    return y

fs=96000; x=stimulus(fs); old=rbj_hp_f32(x,fs); new=stable_dc_f32(x,fs)
a=int((.25+1+.20)*fs); b=int((.25+1+2-.20)*fs)
old_db=fit_thdn(old[a:b],fs); new_db=fit_thdn(new[a:b],fs)
errors=[]
if not new_db < -120: errors.append(f'new stable DC blocker THD+N too high: {new_db:.2f} dB')
am=(ROOT/'audio-modules.js').read_text(encoding='utf-8-sig')
mc=(ROOT/'modular-core.js').read_text(encoding='utf-8-sig')
if 'stable-first-order-iir' not in am: errors.append('runtime stable-first-order-iir marker missing')
if 'transparent: { dcBlockHz:0' not in mc: errors.append('transparent Integrity is not unity')
print({'ok':not errors,'legacy_float32_biquad_reference_db':round(old_db,2),'stable_first_order_iir_db':round(new_db,2),'note':'legacy float32 result is implementation-sensitive and advisory only','errors':errors})
raise SystemExit(1 if errors else 0)
