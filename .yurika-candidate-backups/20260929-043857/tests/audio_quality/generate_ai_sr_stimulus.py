from __future__ import annotations
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent
SR = 96000
DUR = 9.0
N = int(SR * DUR)
t = np.arange(N, dtype=np.float64) / SR
rng = np.random.default_rng(370)

# Low-band-only source: deliberately leaves >24 kHz empty so BWE generation can be inspected.
x = np.zeros(N, dtype=np.float64)

def add_seg(a, b, sig):
    i0, i1 = int(a*SR), int(b*SR)
    w = signal.windows.tukey(max(1, i1-i0), alpha=0.08)
    x[i0:i1] += np.asarray(sig[:i1-i0]) * w

# 0.5-2.5s tonal/harmonic material below 18 kHz.
i0, i1 = int(.5*SR), int(2.5*SR)
tt = np.arange(i1-i0)/SR
sig = (0.18*np.sin(2*np.pi*1000*tt) + 0.11*np.sin(2*np.pi*5000*tt) +
       0.075*np.sin(2*np.pi*9000*tt) + 0.045*np.sin(2*np.pi*13000*tt) +
       0.028*np.sin(2*np.pi*17000*tt))
add_seg(.5, 2.5, sig)

# 2.5-4.5s transient-rich bursts, still low-band.
i0, i1 = int(2.5*SR), int(4.5*SR)
seg = np.zeros(i1-i0)
for at in np.arange(0.08, 1.95, 0.18):
    k = int(at*SR)
    m = min(len(seg)-k, int(.055*SR))
    if m <= 0: continue
    env = np.exp(-np.arange(m)/(0.008*SR))
    carrier = (np.sin(2*np.pi*3500*np.arange(m)/SR) +
               .55*np.sin(2*np.pi*9800*np.arange(m)/SR) +
               .25*np.sin(2*np.pi*15500*np.arange(m)/SR))
    seg[k:k+m] += .20*env*carrier
add_seg(2.5, 4.5, seg)

# 4.5-6.5s texture: shaped noise low-passed to 18 kHz.
noise = rng.standard_normal(int(2*SR))
sos = signal.butter(8, 18000, btype='lowpass', fs=SR, output='sos')
noise = signal.sosfilt(sos, noise)
noise /= max(np.max(np.abs(noise)), 1e-12)
add_seg(4.5, 6.5, .12*noise)

# 6.5-8.5s pseudo-music with amplitude modulation and stereo variation.
i0, i1 = int(6.5*SR), int(8.5*SR)
tm = np.arange(i1-i0)/SR
amp = .55 + .25*np.sin(2*np.pi*2.3*tm) + .12*np.sin(2*np.pi*5.7*tm)
base = amp*(.14*np.sin(2*np.pi*220*tm) + .10*np.sin(2*np.pi*880*tm) +
            .07*np.sin(2*np.pi*3520*tm) + .04*np.sin(2*np.pi*10560*tm))
add_seg(6.5, 8.5, base)

# Global anti-ultrasonic LP to make the no-native-HF contract explicit.
sos = signal.butter(10, 20500, btype='lowpass', fs=SR, output='sos')
low = signal.sosfilt(sos, x)
low /= max(np.max(np.abs(low)), 1.0)
left = low
right = np.roll(low, 7)*0.992
sf.write(HERE/'quality-stimulus-lowband.wav', np.column_stack([left,right]), SR, subtype='FLOAT')

# Native-HF companion: same source plus bounded 30 kHz support in tonal and transient regions.
hf = np.zeros(N, dtype=np.float64)
hf += 0.008*np.sin(2*np.pi*30000*t) * ((t>=.5)&(t<2.5))
for at in np.arange(2.58, 4.4, .18):
    k=int(at*SR); m=min(N-k, int(.025*SR))
    if m<=0: continue
    hf[k:k+m] += .010*np.exp(-np.arange(m)/(0.004*SR))*np.sin(2*np.pi*30000*np.arange(m)/SR)
native = np.column_stack([left + hf, right + .97*hf])
sf.write(HERE/'quality-stimulus-nativehf.wav', native, SR, subtype='FLOAT')
print('generated', HERE/'quality-stimulus-lowband.wav')
print('generated', HERE/'quality-stimulus-nativehf.wav')
