from pathlib import Path
import numpy as np
import soundfile as sf
SR = 48000
OUT = Path(__file__).with_name("quality-stimulus.wav")
rng = np.random.default_rng(20260923)
parts = []
def stereo(l, r=None):
    if r is None: r = l
    return np.stack([l, r], axis=1).astype(np.float32)
def fade(x, n=480):
    x = np.asarray(x, np.float32).copy()
    if len(x) >= 2*n:
        w = np.linspace(0, 1, n, dtype=np.float32)
        x[:n] *= w; x[-n:] *= w[::-1]
    return x
parts.append(np.zeros((int(.25*SR),2), np.float32))
t = np.arange(SR) / SR
# 1 s log sweep, -18 dBFS
f0, f1 = 20.0, 20000.0; k = np.log(f1/f0)
phase = 2*np.pi*f0*(np.exp(k*t)-1)/k
parts.append(stereo(fade((10**(-18/20))*np.sin(phase))))
# 1 kHz sine, -12 dBFS
parts.append(stereo(fade((10**(-12/20))*np.sin(2*np.pi*1000*t))))
# SMPTE-like high-frequency two-tone stress, conservative amplitude
parts.append(stereo(fade((10**(-18/20))*(np.sin(2*np.pi*19000*t)+np.sin(2*np.pi*20000*t)))))
# Multitone for frequency-response snapshots
freqs = np.array([63,125,250,500,1000,2000,4000,8000,16000], float)
ph = rng.uniform(0,2*np.pi,len(freqs))
s = sum(np.sin(2*np.pi*f*t+p) for f,p in zip(freqs,ph)); s = s/np.max(np.abs(s))*0.22
parts.append(stereo(fade(s)))
# Stereo separation diagnostic
parts.append(stereo(fade(.18*np.sin(2*np.pi*997*t)), fade(.18*np.sin(2*np.pi*1499*t))))
# Transient train
x = np.zeros(SR); idx = np.arange(int(.1*SR), SR, int(.1*SR)); x[idx] = .55
kernel = np.exp(-np.arange(int(.012*SR))/(.0025*SR)); x = np.convolve(x,kernel,mode="same")[:SR]
x += .01*rng.standard_normal(SR); x = np.clip(x,-.8,.8); parts.append(stereo(fade(x)))
# Pseudo-music stress: harmonic bed + percussive noise
ch = np.zeros(SR)
for f,a in [(110,.06),(220,.05),(261.63,.045),(329.63,.04),(392,.035),(659.25,.02),(3135,.008)]:
    ch += a*np.sin(2*np.pi*f*t+rng.uniform(0,2*np.pi))
for onset in np.arange(.05,.95,.125):
    i=int(onset*SR); n=min(int(.08*SR),SR-i); env=np.exp(-np.arange(n)/(.012*SR))
    ch[i:i+n] += rng.standard_normal(n)*.035*env
ch=np.tanh(ch*1.3); parts.append(stereo(fade(ch), fade(np.roll(ch,37)*.97)))
parts.append(np.zeros((int(.25*SR),2), np.float32))
y=np.concatenate(parts)
sf.write(OUT,y,SR,subtype="PCM_24")
print(f"generated {OUT} {y.shape} {len(y)/SR:.3f}s peak={np.max(np.abs(y)):.6f}")
