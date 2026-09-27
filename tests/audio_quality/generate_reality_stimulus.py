from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy import signal

SR=48000
HERE=Path(__file__).resolve().parent
RNG=np.random.default_rng(20260927)
DUR=8.0
N=int(SR*DUR)
t=np.arange(N)/SR

# Deterministic voice-like excitation with sub-cycle timing/amplitude variation.
f0=154.0 + 18*np.sin(2*np.pi*0.23*t) + 2.2*np.sin(2*np.pi*4.7*t)
phase=2*np.pi*np.cumsum(f0)/SR
# Harmonic glottal-like source with nonstationary spectral slope.
voice=np.zeros(N)
for h in range(1,15):
    tilt=(1/h**1.18)*(1+0.06*np.sin(2*np.pi*(0.7+0.03*h)*t+h*0.17))
    voice += tilt*np.sin(h*phase + 0.025*h*np.sin(2*np.pi*3.1*t))
voice/=max(np.max(np.abs(voice)),1e-12)

# Syllabic macro-envelope + micro-envelope flutter.
syll=0.18+0.82*(0.5+0.5*signal.sawtooth(2*np.pi*1.72*t,width=0.72))
syll=np.clip(syll,0,1)**1.6
micro=1+0.035*np.sin(2*np.pi*11.3*t)+0.018*np.sin(2*np.pi*17.9*t+0.6)
voice*=0.34*syll*micro

# Breath and consonant-like short events.
noise=RNG.standard_normal(N)
sos=signal.butter(3,[2600/(SR/2),15000/(SR/2)],btype='bandpass',output='sos')
breath=signal.sosfilt(sos,noise)
breath/=max(np.max(np.abs(breath)),1e-12)
breath*=0.018*(0.35+0.65*syll)
trans=np.zeros(N)
for sec in [0.62,1.44,2.17,3.06,3.71,4.58,5.22,6.14,7.05]:
    i=int(sec*SR); L=int(0.020*SR)
    env=np.exp(-np.arange(L)/(0.0045*SR))
    burst=RNG.standard_normal(L)*env
    trans[i:i+L]+=0.038*burst
mono=voice+breath+trans

# Tiny stereo micro-difference without changing the main center image.
right=signal.lfilter([1,-0.012],[1],mono)+0.0025*signal.sosfilt(signal.butter(2,[5000/(SR/2),14000/(SR/2)],btype='bandpass',output='sos'),RNG.standard_normal(N))
left=mono
pristine=np.stack([left,right],axis=1)
pristine*=0.55/max(np.max(np.abs(pristine)),1e-12)

# Digital-degradation proxy: short temporal smear + micro-dynamic flattening + quantization.
# It intentionally preserves the broad spectral content so the benchmark tests temporal/detail recovery,
# not magical reconstruction of frequency content that no longer exists.
k=np.array([0.08,0.17,0.50,0.17,0.08],float)
degraded=np.column_stack([np.convolve(pristine[:,c],k,mode='same') for c in range(2)])
# Mild block-envelope flattening (2 ms blocks).
bs=96
for i in range(0,N,bs):
    sl=slice(i,min(N,i+bs)); block=degraded[sl]
    pk=np.max(np.abs(block))+1e-9
    degraded[sl]=np.tanh(block/(pk*0.92))*pk*0.92
# 14-bit-ish quantization + very low deterministic dither.
q=8192.0
dither=(RNG.random(degraded.shape)-0.5)/q
degraded=np.round((degraded+dither)*q)/q
degraded=np.clip(degraded,-0.98,0.98).astype(np.float32)
pristine=pristine.astype(np.float32)

sf.write(HERE/'reality-pristine.wav',pristine,SR,subtype='FLOAT')
sf.write(HERE/'reality-degraded.wav',degraded,SR,subtype='FLOAT')
meta={
  'sample_rate':SR,'duration_s':DUR,
  'kind':'R5 temporal-microstructure full-reference benchmark',
  'degradation':['5-tap temporal smear','2ms block microdynamic flattening','14-bit-like quantization with deterministic dither'],
  'claim_guard':'The pristine file is available to the evaluator only; the runtime R5 DSP never receives it.',
  'metrics':['TFS correlation','envelope modulation correlation','instantaneous phase error','group delay error','CPP','jitter','shimmer','HNR','sample entropy','higher-order moments','bicoherence proxy','transient preservation','R5 feature-space distance','SI-SDR']
}
(HERE/'reality-metadata.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
print(f'R5 stimulus: {DUR:.2f}s peak pristine={np.max(np.abs(pristine)):.4f} degraded={np.max(np.abs(degraded)):.4f}')
