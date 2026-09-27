from pathlib import Path
import numpy as np, soundfile as sf
HERE=Path(__file__).resolve().parent
sr=48000; dur=0.75; n=int(sr*dur)
x=np.zeros((n,2),np.float32)
i=int(0.25*sr)
x[i,0]=0.42; x[i,1]=0.42
# tiny broadband marker after the main impulse to expose early-reflection coloration without dominating decay
rng=np.random.default_rng(3401)
noise=(rng.standard_normal(int(.008*sr))*0.02).astype(np.float32)
x[i+int(.03*sr):i+int(.03*sr)+len(noise),0]+=noise
x[i+int(.03*sr):i+int(.03*sr)+len(noise),1]+=noise
sf.write(HERE/'concert-hall-stimulus.wav',x,sr,subtype='FLOAT')
print('generated',HERE/'concert-hall-stimulus.wav')
