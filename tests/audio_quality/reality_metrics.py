from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy import signal, stats
from scipy.spatial import cKDTree

HERE=Path(__file__).resolve().parent
RESULTS=HERE/'results'; RESULTS.mkdir(parents=True,exist_ok=True)
EPS=1e-12

def read_stereo(path):
    x,sr=sf.read(path,always_2d=True,dtype='float64')
    if x.shape[1]==1:x=np.repeat(x,2,axis=1)
    return x[:,:2],sr

def resample_reference(x, src_sr, dst_sr):
    """Resample the evaluator-only pristine reference to the Chromium capture rate.

    The browser AudioContext may run at 44.1 kHz even though the deterministic
    source/reference WAVs are authored at 48 kHz. The R5 runtime never receives
    the pristine reference; this conversion exists only so full-reference metrics
    compare signals on the same sampling grid.
    """
    src_sr=int(src_sr); dst_sr=int(dst_sr)
    if src_sr == dst_sr:
        return np.asarray(x,float)
    g=math.gcd(src_sr,dst_sr)
    return signal.resample_poly(np.asarray(x,float), dst_sr//g, src_sr//g, axis=0)

def rms(x): return float(np.sqrt(np.mean(np.square(np.asarray(x,float)))+1e-30))
def db20(v): return float(20*np.log10(max(float(v),1e-15)))
def mono(x): return np.mean(np.asarray(x,float),axis=1) if np.asarray(x).ndim==2 else np.asarray(x,float)
def clip_seconds(x,sr,seconds=4.0): return np.asarray(x)[:min(len(x),int(sr*seconds))]

def align_to(ref,x,sr,max_ms=50):
    r=mono(ref); y=mono(x); n=min(len(r),len(y));r=r[:n];y=y[:n]
    maxlag=int(sr*max_ms/1000)
    c=signal.correlate(y,r,mode='full',method='fft'); l=signal.correlation_lags(len(y),len(r),mode='full')
    m=np.abs(l)<=maxlag; lag=int(l[m][np.argmax(c[m])])
    if lag>=0: yy=x[lag:]; rr=ref[:len(yy)]
    else: rr=ref[-lag:]; yy=x[:len(rr)]
    n=min(len(rr),len(yy)); return rr[:n],yy[:n],lag

def si_sdr(ref,est):
    r=mono(ref); e=mono(est); n=min(len(r),len(e));r=r[:n];e=e[:n]
    r=r-np.mean(r); e=e-np.mean(e)
    a=np.dot(e,r)/(np.dot(r,r)+EPS); target=a*r; noise=e-target
    return 10*np.log10((np.dot(target,target)+EPS)/(np.dot(noise,noise)+EPS))

def corr(ref,x):
    a=mono(ref);b=mono(x);n=min(len(a),len(b));a=a[:n];b=b[:n]
    return float(np.corrcoef(a,b)[0,1])

def band_sos(sr,lo,hi):
    lo=max(30,lo);hi=min(sr*.45,hi)
    return signal.butter(3,[lo/(sr/2),hi/(sr/2)],btype='bandpass',output='sos')

def tfs_and_env(x,sr,bands=((90,220),(220,500),(500,1200),(1200,2800),(2800,6000),(6000,12000))):
    x=mono(clip_seconds(x,sr,4.0)); tfs=[]; env=[]
    for lo,hi in bands:
        if hi>=sr*.48: continue
        y=signal.sosfiltfilt(band_sos(sr,lo,hi),x)
        a=signal.hilbert(y); mag=np.abs(a)+1e-9
        tfs.append(np.cos(np.angle(a)))
        # ENV cue: lowpass 80 Hz on analytic magnitude.
        sos=signal.butter(3,80/(sr/2),btype='lowpass',output='sos')
        env.append(signal.sosfiltfilt(sos,mag))
    return tfs,env

def mean_pair_corr(a,b):
    vals=[]
    for x,y in zip(a,b):
        n=min(len(x),len(y)); xx=x[:n];yy=y[:n]
        if np.std(xx)<1e-10 or np.std(yy)<1e-10: continue
        vals.append(np.corrcoef(xx,yy)[0,1])
    return float(np.mean(vals)) if vals else float('nan')

def phase_mae_deg(ref,x,sr):
    ref=clip_seconds(ref,sr,4.0); x=clip_seconds(x,sr,4.0)
    vals=[]
    for lo,hi in ((120,450),(450,1400),(1400,4000),(4000,10000)):
        rr=signal.sosfiltfilt(band_sos(sr,lo,hi),mono(ref)); xx=signal.sosfiltfilt(band_sos(sr,lo,hi),mono(x))
        n=min(len(rr),len(xx)); ar=signal.hilbert(rr[:n]); ax=signal.hilbert(xx[:n]);
        w=np.minimum(np.abs(ar),np.abs(ax)); mask=w>np.percentile(w,35)
        d=np.angle(ax[mask]*np.conj(ar[mask])); vals.append(np.mean(np.abs(d))*180/np.pi)
    return float(np.mean(vals))

def group_delay_rmse_us(ref,x,sr):
    r=mono(clip_seconds(ref,sr,4.0));y=mono(clip_seconds(x,sr,4.0)); nper=1024; hop=256
    f,t,R=signal.stft(r,fs=sr,nperseg=nper,noverlap=nper-hop,boundary=None,padded=False)
    _,_,Y=signal.stft(y,fs=sr,nperseg=nper,noverlap=nper-hop,boundary=None,padded=False)
    n=min(R.shape[1],Y.shape[1]);R=R[:,:n];Y=Y[:,:n]
    # group delay = -d phase / d omega. Compare relative GD to reference.
    pr=np.unwrap(np.angle(R),axis=0); py=np.unwrap(np.angle(Y),axis=0)
    omega=2*np.pi*f; gd_r=-np.gradient(pr,omega,axis=0); gd_y=-np.gradient(py,omega,axis=0)
    w=np.abs(R); mask=(f>=100)&(f<=12000); w=w[mask]; d=(gd_y-gd_r)[mask]
    val=np.sqrt(np.sum(w*d*d)/(np.sum(w)+EPS))*1e6
    return float(val)

def modulation_similarity(ref,x,sr):
    tr,er=tfs_and_env(ref,sr); tx,ex=tfs_and_env(x,sr)
    vals=[]
    for a,b in zip(er,ex):
        # Downsample envelopes, compare 0.5..40 Hz modulation spectra.
        step=max(1,sr//400); aa=a[::step];bb=b[::step]; fs=sr/step
        n=min(len(aa),len(bb)); win=signal.windows.hann(n,sym=False)
        A=np.abs(np.fft.rfft((aa[:n]-np.mean(aa[:n]))*win));B=np.abs(np.fft.rfft((bb[:n]-np.mean(bb[:n]))*win));ff=np.fft.rfftfreq(n,1/fs)
        m=(ff>=.5)&(ff<=40); A=np.log1p(A[m]);B=np.log1p(B[m])
        if np.std(A)>1e-9 and np.std(B)>1e-9:vals.append(np.corrcoef(A,B)[0,1])
    return float(np.mean(vals)) if vals else float('nan')

def cpp_db(x,sr):
    x=mono(clip_seconds(x,sr,4.0)); frame=int(.04*sr); hop=int(.01*sr); vals=[]
    qmin=int(sr/350); qmax=int(sr/70)
    for st in range(0,len(x)-frame,hop):
        seg=x[st:st+frame]*signal.windows.hann(frame,sym=False)
        if rms(seg)<1e-4: continue
        spec=np.log(np.abs(np.fft.rfft(seg))+1e-9); cep=np.fft.irfft(spec)
        q=cep[qmin:qmax]
        if not len(q):continue
        pk=int(np.argmax(q))+qmin
        # local linear baseline across quefrency search region
        idx=np.arange(qmin,qmax); coef=np.polyfit(idx,cep[qmin:qmax],1); base=np.polyval(coef,pk)
        vals.append(cep[pk]-base)
    # scale to dB-like cepstral prominence for relative comparisons only.
    return float(20*np.log10(max(np.median(vals),1e-9)+1.0)) if vals else float('nan')

def pitch_periods(x,sr):
    y=mono(clip_seconds(x,sr,4.0)); frame=int(.05*sr); hop=int(.02*sr); periods=[]; amps=[]
    minlag=int(sr/350);maxlag=int(sr/70)
    for st in range(0,len(y)-frame,hop):
        z=y[st:st+frame];z=z-np.mean(z)
        if rms(z)<.01: continue
        c=signal.correlate(z,z,mode='full',method='fft')[frame-1:]
        lag=minlag+int(np.argmax(c[minlag:maxlag]))
        if c[lag] < .18*c[0]: continue
        periods.append(lag/sr); amps.append(np.sqrt(np.mean(z*z)))
    return np.asarray(periods),np.asarray(amps)

def voice_period_metrics(x,sr):
    p,a=pitch_periods(x,sr)
    jitter=100*np.mean(np.abs(np.diff(p)))/(np.mean(p)+EPS) if len(p)>2 else np.nan
    shimmer=100*np.mean(np.abs(np.diff(a)))/(np.mean(a)+EPS) if len(a)>2 else np.nan
    # autocorrelation HNR over voiced frames proxy
    y=mono(x); frame=int(.05*sr); hop=int(.02*sr); hs=[];minlag=int(sr/350);maxlag=int(sr/70)
    for st in range(0,len(y)-frame,hop):
        z=y[st:st+frame]-np.mean(y[st:st+frame]); c=signal.correlate(z,z,mode='full',method='fft')[frame-1:]
        if c[0]<EPS:continue
        rho=np.max(c[minlag:maxlag])/(c[0]+EPS);rho=np.clip(rho,1e-6,.999999);hs.append(10*np.log10(rho/(1-rho)))
    return {'jitter_pct':float(jitter),'shimmer_pct':float(shimmer),'hnr_db':float(np.median(hs)) if hs else np.nan}

def sample_entropy(x,sr):
    y=mono(clip_seconds(x,sr,3.0)); # bounded workload for CI
    y=signal.resample_poly(y,1,max(1,sr//400));
    if len(y)>1200:y=y[:1200]
    y=(y-np.mean(y))/(np.std(y)+EPS); r=.2
    def count(m):
        emb=np.lib.stride_tricks.sliding_window_view(y,m)
        tree=cKDTree(emb); pairs=tree.query_pairs(r,p=np.inf)
        return max(len(pairs),1)
    return float(-np.log(count(3)/count(2)))

def standardized_moments(x,sr):
    y=mono(clip_seconds(x,sr,4.0)); y=(y-np.mean(y))/(np.std(y)+EPS)
    return {'m3':float(np.mean(y**3)),'m4':float(np.mean(y**4)),'m5':float(np.mean(y**5))}

def bicoherence_proxy(x,sr):
    y=mono(clip_seconds(x,sr,4.0)); nper=1024; hop=512
    frames=[]
    for st in range(0,len(y)-nper,hop):frames.append(np.fft.rfft(y[st:st+nper]*signal.windows.hann(nper,sym=False)))
    if len(frames)<3:return np.nan
    X=np.asarray(frames); vals=[]
    # low-order harmonic coupling grid, avoids huge O(N^2) bispectrum.
    for i in range(3,22,3):
        for j in range(3,22,3):
            k=i+j
            if k>=X.shape[1]:continue
            num=np.abs(np.mean(X[:,i]*X[:,j]*np.conj(X[:,k])))**2
            den=np.mean(np.abs(X[:,i]*X[:,j])**2)*np.mean(np.abs(X[:,k])**2)+EPS
            vals.append(num/den)
    return float(np.mean(vals)) if vals else np.nan

def transient_index(x,sr):
    y=mono(clip_seconds(x,sr,4.0)); d=np.diff(y,prepend=y[0]);
    return {'derivative_rms':rms(d),'derivative_crest':float(np.max(np.abs(d))/(rms(d)+EPS))}

def r5_feature_summary(x):
    a=np.asarray(x,float)[:96000]; L=a[:,0];R=a[:,1] if a.shape[1]>1 else L
    prev1=np.zeros(2);prev2=np.zeros(2);fast=slow=0.; E=np.zeros(5);pE=0.;n=0
    for l,r in zip(L,R):
        mid=.5*(l+r);side=.5*(l-r);ab=abs(mid);fast+=(ab-fast)*.22;slow+=(ab-slow)*.012;norm=slow+.008
        p1m=.5*(prev1[0]+prev1[1]);p2m=.5*(prev2[0]+prev2[1])
        vals=[np.tanh(((mid-p1m)/norm)*.75),np.tanh(((mid-2*p1m+p2m)/norm)*.52),np.tanh(((mid-(1.72*p1m-.74*p2m))/norm)*.68),np.tanh(((fast-slow)/norm)*1.25),np.tanh(((ab-abs(side))/(ab+abs(side)+1e-7))*1.0)]
        E+=np.asarray(vals)**2;s=np.clip(sum(vals)/2.75,-1,1);p=s**5;pE+=p*p;n+=1
        prev2[:]=prev1;prev1[:]=[l,r]
    return {'feature_rms':np.sqrt(E/max(n,1)).tolist(),'p5_rms':float(np.sqrt(pE/max(n,1)))}

def metric_bundle(pristine,x,sr):
    rr,xx,lag=align_to(pristine,x,sr)
    tr,er=tfs_and_env(rr,sr);tx,ex=tfs_and_env(xx,sr)
    pm=voice_period_metrics(xx,sr); rm=voice_period_metrics(rr,sr)
    mm=standardized_moments(xx,sr); mr=standardized_moments(rr,sr)
    ti=transient_index(xx,sr); tir=transient_index(rr,sr)
    f=r5_feature_summary(xx);fr=r5_feature_summary(rr)
    fd=float(np.linalg.norm(np.asarray(f['feature_rms'])-np.asarray(fr['feature_rms'])))
    return {
      'lag_ms':lag*1000/sr,'waveform_corr':corr(rr,xx),'si_sdr_db':si_sdr(rr,xx),
      'tfs_corr':mean_pair_corr(tr,tx),'envelope_corr':mean_pair_corr(er,ex),'modulation_corr':modulation_similarity(rr,xx,sr),
      'instantaneous_phase_mae_deg':phase_mae_deg(rr,xx,sr),'group_delay_rmse_us':group_delay_rmse_us(rr,xx,sr),
      'cpp_db':cpp_db(xx,sr),'cpp_abs_delta_db':abs(cpp_db(xx,sr)-cpp_db(rr,sr)),
      'jitter_pct':pm['jitter_pct'],'jitter_abs_delta_pct':abs(pm['jitter_pct']-rm['jitter_pct']),
      'shimmer_pct':pm['shimmer_pct'],'shimmer_abs_delta_pct':abs(pm['shimmer_pct']-rm['shimmer_pct']),
      'hnr_db':pm['hnr_db'],'hnr_abs_delta_db':abs(pm['hnr_db']-rm['hnr_db']),
      'sample_entropy':sample_entropy(xx,sr),'sample_entropy_abs_delta':abs(sample_entropy(xx,sr)-sample_entropy(rr,sr)),
      'bicoherence_proxy':bicoherence_proxy(xx,sr),'bicoherence_abs_delta':abs(bicoherence_proxy(xx,sr)-bicoherence_proxy(rr,sr)),
      'moment3_abs_delta':abs(mm['m3']-mr['m3']),'moment4_abs_delta':abs(mm['m4']-mr['m4']),'moment5_abs_delta':abs(mm['m5']-mr['m5']),
      'transient_derivative_rms_ratio':ti['derivative_rms']/(tir['derivative_rms']+EPS),'transient_crest_abs_delta':abs(ti['derivative_crest']-tir['derivative_crest']),
      'r5_feature_distance':fd,'r5_p5_abs_delta':abs(f['p5_rms']-fr['p5_rms']),
      'peak_dbfs':db20(np.max(np.abs(xx)))
    }

def improvement(pre,post,key,higher=True):
    a=pre[key];b=post[key]
    return float(b-a) if higher else float(a-b)

def main():
    pristine,reference_sr=read_stereo(HERE/'reality-pristine.wav')
    pre,capture_sr=read_stereo(RESULTS/'reality.pre.wav'); post,sr3=read_stereo(RESULTS/'reality.post.wav'); final,sr4=read_stereo(RESULTS/'reality.final.wav')
    if len({capture_sr,sr3,sr4})!=1:raise RuntimeError('captured sample-rate mismatch')
    reference_resampled = int(reference_sr) != int(capture_sr)
    pristine=resample_reference(pristine,reference_sr,capture_sr)
    sr=capture_sr
    P=metric_bundle(pristine,pre,sr);O=metric_bundle(pristine,post,sr)
    rr,ff,flag=align_to(pristine,final,sr);F={'lag_ms':flag*1000/sr,'waveform_corr':corr(rr,ff),'si_sdr_db':si_sdr(rr,ff),'peak_dbfs':db20(np.max(np.abs(ff)))}
    keys_hi=['waveform_corr','si_sdr_db','tfs_corr','envelope_corr','modulation_corr']
    keys_lo=['instantaneous_phase_mae_deg','group_delay_rmse_us','cpp_abs_delta_db','jitter_abs_delta_pct','shimmer_abs_delta_pct','hnr_abs_delta_db','sample_entropy_abs_delta','bicoherence_abs_delta','moment3_abs_delta','moment4_abs_delta','moment5_abs_delta','transient_crest_abs_delta','r5_feature_distance','r5_p5_abs_delta']
    imp={k:improvement(P,O,k,True) for k in keys_hi};imp.update({k:improvement(P,O,k,False) for k in keys_lo})
    improved=sum(v>0 for v in imp.values());regressed=sum(v<0 for v in imp.values())
    critical=[];warnings=[]
    if abs(O['lag_ms']-P['lag_ms'])>.35:critical.append('R5 added >0.35 ms relative timing shift')
    if O['peak_dbfs']>0.1:critical.append('R5 output exceeds +0.1 dBFS before downstream safety')
    if O['si_sdr_db'] < P['si_sdr_db']-1.0:warnings.append('SI-SDR regressed >1 dB against pristine reference')
    if O['tfs_corr'] < P['tfs_corr']-0.015:warnings.append('TFS correlation regressed >0.015')
    if O['envelope_corr'] < P['envelope_corr']-0.01:warnings.append('Envelope correlation regressed >0.01')
    if O['group_delay_rmse_us'] > P['group_delay_rmse_us']*1.20+2:warnings.append('Group-delay error increased materially')
    if O['moment5_abs_delta'] > max(P['moment5_abs_delta']*1.5,.10):warnings.append('5th standardized moment diverged materially')
    status={}
    sp=RESULTS/'reality.status.json'
    if sp.exists():status=json.loads(sp.read_text())
    r5=(status.get('realityResolution') or {}) if isinstance(status,dict) else {}
    if r5 and int(r5.get('algorithmicLatencyFrames',0))!=0:critical.append('runtime R5 reports non-zero algorithmic latency')
    report={
      'gate':'PASS' if not critical else 'FAIL','critical':critical,'warnings':warnings,
      'reference_kind':'full-reference pristine vs degraded vs R5 output',
      'reference_sample_rate':int(reference_sr),'capture_sample_rate':int(capture_sr),'reference_resampled_to_capture_rate':reference_resampled,
      'pre':P,'post_r5':O,'final_chain':F,'improvements_post_minus_pre_or_error_reduction':imp,
      'improved_metric_count':improved,'regressed_metric_count':regressed,'metric_count':len(imp),
      'runtime_status':r5,
      'interpretation_note':'Positive improvement values mean closer to the synthetic pristine reference for that metric. This benchmark does not prove recovery of unknowable source information or subjective realism.'
    }
    (RESULTS/'reality-report.json').write_text(json.dumps(report,indent=2,allow_nan=False),encoding='utf-8')
    lines=['# R5 Reality Resolution Evaluation','',f"**Gate:** {report['gate']}",f"**Directional improvements:** {improved}/{len(imp)} metrics; regressions {regressed}/{len(imp)}",f"**Reference / capture sample rate:** {int(reference_sr)} Hz → {int(capture_sr)} Hz" + (' (reference resampled for evaluation)' if reference_resampled else ''),'',
           '| Metric | Degraded input | R5 output | Directional change |','|---|---:|---:|---:|']
    ordered=[('SI-SDR dB','si_sdr_db',True),('Waveform corr','waveform_corr',True),('TFS corr','tfs_corr',True),('Envelope corr','envelope_corr',True),('Modulation corr','modulation_corr',True),('Phase MAE deg','instantaneous_phase_mae_deg',False),('Group delay RMSE us','group_delay_rmse_us',False),('CPP abs delta dB','cpp_abs_delta_db',False),('Jitter abs delta %','jitter_abs_delta_pct',False),('Shimmer abs delta %','shimmer_abs_delta_pct',False),('HNR abs delta dB','hnr_abs_delta_db',False),('Sample entropy abs delta','sample_entropy_abs_delta',False),('Bicoherence abs delta','bicoherence_abs_delta',False),('3rd moment abs delta','moment3_abs_delta',False),('4th moment abs delta','moment4_abs_delta',False),('5th moment abs delta','moment5_abs_delta',False),('Transient crest abs delta','transient_crest_abs_delta',False),('R5 feature distance','r5_feature_distance',False),('R5 P5 abs delta','r5_p5_abs_delta',False)]
    for label,k,hi in ordered:
        delta=(O[k]-P[k]) if hi else (P[k]-O[k])
        lines.append(f'| {label} | {P[k]:.6g} | {O[k]:.6g} | {delta:+.6g} |')
    if critical: lines += ['', '## Critical', *[f'- {x}' for x in critical]]
    if warnings: lines += ['', '## Warnings', *[f'- {x}' for x in warnings]]
    lines += ['', 'Positive change means movement toward the synthetic pristine reference for that metric. No single metric is treated as proof of perceived realism.']
    (RESULTS/'reality-report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps({'gate':report['gate'],'improved':improved,'regressed':regressed,'warnings':warnings},indent=2))
    if critical: raise SystemExit(1)

if __name__=='__main__':main()
