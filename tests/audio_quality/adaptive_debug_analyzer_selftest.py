import numpy as np
from scipy import signal
import math
SR=48000;t=np.arange(2*SR)/SR;A=10**(-12/20);base=A*np.sin(2*np.pi*1000*t)
def fit(x):
 A0=np.column_stack([np.sin(2*np.pi*1000*t),np.cos(2*np.pi*1000*t),np.ones(len(t))]);c=np.linalg.lstsq(A0,x,rcond=None)[0];y=A0@c;fund=np.sqrt(np.mean((y-y.mean())**2));res=x-y;return 20*np.log10(np.sqrt(np.mean(res*res))/fund)
clean=fit(base); am=fit(base*(1+0.01*np.sin(2*np.pi*5*t))); cubic=fit(base+0.01*base**3)
assert clean < -200
assert am > -50 and am < -35
assert cubic < -70
print({'ok':True,'clean_thdn_db':clean,'am_1pct_thdn_db':am,'cubic_thdn_db':cubic})
