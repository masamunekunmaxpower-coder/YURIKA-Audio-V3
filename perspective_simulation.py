import math,sys
# Mirrors the v1.4 perspective model numerically enough to bound gain/energy and reflection timing.
taps_l=[(7.1,.34),(12.8,-.19),(19.6,.12),(28.7,-.075),(41.2,.042)]
taps_r=[(8.9,.32),(14.7,-.17),(22.4,.115),(31.6,-.068),(44.1,.038)]
for fs in (48000,96000):
    for depth in (0,25,50,75,100):
        t=depth/100
        wet=.12*t; direct=10**((-0.60*t)/20); predelay=3+10*t
        n=int(fs*.08); L=[0.0]*n; R=[0.0]*n; L[0]=R[0]=direct
        for ms,a in taps_l:
            idx=round(fs*(predelay+ms)/1000)
            if idx<n: L[idx]+=a*wet
        for ms,a in taps_r:
            idx=round(fs*(predelay+ms)/1000)
            if idx<n: R[idx]+=a*wet
        peak=max(max(map(abs,L)),max(map(abs,R)))
        energy=(sum(x*x for x in L)+sum(x*x for x in R))/2
        assert peak<=1.000001,(fs,depth,peak)
        assert energy<1.05,(fs,depth,energy)
        if depth>0:
            first=min(i for i,x in enumerate(L[1:],1) if abs(x)>1e-12)
            assert first/fs*1000>=10.0,(fs,depth,first/fs*1000)
print('PASS perspective_simulation 48/96k impulse peak + energy + reflection timing bounds')
