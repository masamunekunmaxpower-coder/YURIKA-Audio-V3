from pathlib import Path
import json
import numpy as np
import soundfile as sf
SR=48000
HERE=Path(__file__).resolve().parent
OUT=HERE/'control-debug-stimulus.wav'
META=HERE/'control-debug-metadata.json'
parts=[]; seg={}
def add(name,x):
    start=sum(len(p) for p in parts)/SR; parts.append(x.astype(np.float32)); end=sum(len(p) for p in parts)/SR; seg[name]={'start':start,'end':end}
def stereo(x): return np.stack([x,x],axis=1)
def fade(x,n=480):
    y=np.asarray(x,np.float32).copy()
    if len(y)>=2*n:
        w=np.linspace(0,1,n,dtype=np.float32); y[:n]*=w; y[-n:]*=w[::-1]
    return y
add('silence_pre',np.zeros((int(.25*SR),2),np.float32))
t=np.arange(SR)/SR
f0,f1=20.0,20000.0;k=np.log(f1/f0);phase=2*np.pi*f0*(np.exp(k*t)-1)/k
add('sweep',stereo(fade((10**(-18/20))*np.sin(phase))))
t2=np.arange(int(2.0*SR))/SR
add('sine',stereo(fade((10**(-12/20))*np.sin(2*np.pi*1000*t2))))
add('silence_post',np.zeros((int(.25*SR),2),np.float32))
y=np.concatenate(parts)
sf.write(OUT,y,SR,subtype='PCM_24')
META.write_text(json.dumps({'sample_rate':SR,'segments':seg},indent=2),encoding='utf-8')
print(f'generated {OUT} {len(y)/SR:.3f}s')
