from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal, stats

HERE = Path(__file__).resolve().parent
RESULTS = HERE / 'results'


def rms(x):
    x = np.asarray(x, dtype=np.float64)
    return float(np.sqrt(np.mean(x * x) + 1e-30))


def db20(x):
    return 20.0 * math.log10(max(float(x), 1e-15))


def tone_complex(x, sr, f):
    x = np.asarray(x, dtype=np.float64)
    n = len(x); t = np.arange(n) / sr
    return (np.sqrt(2.0) / n) * np.sum(x * np.exp(-2j*np.pi*f*t))


def tone_amp(x, sr, f):
    return float(abs(tone_complex(x, sr, f)))


def read_stereo(path):
    x, sr = sf.read(path, always_2d=True, dtype='float64')
    return x, int(sr)


def xcorr_lag(ref, out, sr, max_ms=20.0):
    r = np.mean(ref, axis=1); o = np.mean(out, axis=1)
    n = min(len(r), len(o)); r = r[:n]; o = o[:n]
    c = signal.correlate(o, r, mode='full', method='fft')
    lags = signal.correlation_lags(len(o), len(r), mode='full')
    m = np.abs(lags) <= int(max_ms * sr / 1000)
    return int(lags[m][np.argmax(c[m])])


def align_pair(ref, out, lag):
    if lag >= 0:
        o = out[lag:]; r = ref[:len(o)]
    else:
        r = ref[-lag:]; o = out[:len(r)]
    n = min(len(r), len(o))
    return r[:n], o[:n]


def meta_slice(x, sr, meta, name, trim=0.06):
    seg = meta['segments'][name]
    a = seg['start'] + trim; b = seg['end'] - trim
    if b <= a: a, b = seg['start'], seg['end']
    return x[int(round(a*sr)):int(round(b*sr))]


def bandpass(x, sr, lo, hi, order=4):
    ny = sr/2
    lo = max(5.0, lo); hi = min(hi, ny*0.92)
    sos = signal.butter(order, [lo/ny, hi/ny], btype='bandpass', output='sos')
    return signal.sosfiltfilt(sos, x, axis=0)


def interaural_itd_us(seg, sr):
    z = bandpass(seg, sr, 200, 1500)
    L, R = z[:,0], z[:,1]
    c = signal.correlate(R, L, mode='full', method='fft')
    lags = signal.correlation_lags(len(R), len(L), mode='full')
    m = np.abs(lags) <= int(0.0012 * sr)
    lag = int(lags[m][np.argmax(c[m])])
    # Positive = right source / right ear earlier.
    return float(-lag * 1e6 / sr)


def interaural_ild_db(seg, sr):
    z = bandpass(seg, sr, 2000, min(12000, sr*0.40))
    return float(20*np.log10(max(rms(z[:,1]),1e-15)/max(rms(z[:,0]),1e-15)))


def side_mid_db(seg):
    L, R = seg[:,0], seg[:,1]
    mid = 0.5*(L+R); side = 0.5*(L-R)
    return float(20*np.log10(max(rms(side),1e-15)/max(rms(mid),1e-15)))


def iacc(seg, sr, max_ms=1.0):
    z = bandpass(seg, sr, 200, min(12000, sr*0.40))
    L = z[:,0] - np.mean(z[:,0]); R = z[:,1] - np.mean(z[:,1])
    c = signal.correlate(L, R, mode='full', method='fft')
    lags = signal.correlation_lags(len(L), len(R), mode='full')
    m = np.abs(lags) <= int(max_ms * sr / 1000)
    denom = math.sqrt(float(np.dot(L,L)*np.dot(R,R))) + 1e-30
    return float(np.max(np.abs(c[m])) / denom)


def spectral_vector(seg, sr, freqs=None):
    if freqs is None:
        freqs = np.geomspace(2200, min(15000, sr*0.42), 28)
    mono = np.mean(seg, axis=1)
    w = signal.windows.hann(len(mono), sym=False)
    nfft = int(2**math.ceil(math.log2(max(2048, len(mono)))))
    X = np.fft.rfft(mono*w, n=nfft)
    f = np.fft.rfftfreq(nfft, 1/sr)
    mag = 20*np.log10(np.maximum(np.abs(X), 1e-12))
    v = np.interp(freqs, f, mag)
    return v - np.mean(v)


def template_classification(ref, out, sr, meta, names):
    refs = {n:spectral_vector(meta_slice(ref, sr, meta, n), sr) for n in names}
    rows=[]; correct=0; corrs=[]
    for n in names:
        v=spectral_vector(meta_slice(out,sr,meta,n), sr)
        d={k:float(np.sqrt(np.mean((v-rv)**2))) for k,rv in refs.items()}
        pred=min(d,key=d.get)
        if pred==n: correct+=1
        rv=refs[n]
        c=float(np.corrcoef(v,rv)[0,1]) if np.std(v)>0 and np.std(rv)>0 else 0.0
        corrs.append(c)
        rows.append({'target':n,'predicted':pred,'spectral_rmse_db':round(d[n],3),'spectral_corr':round(c,5)})
    return {'accuracy_pct':round(100*correct/len(names),2), 'mean_spectral_corr':round(float(np.mean(corrs)),5), 'rows':rows}


def early_reflection_ratio(seg, sr):
    mono=np.mean(seg,axis=1)
    i=int(np.argmax(np.abs(mono)))
    d0=i; d1=min(len(mono), i+int(.0015*sr))
    e0=d1; e1=min(len(mono), i+int(.020*sr))
    direct=float(np.sum(mono[d0:d1]**2))+1e-30
    early=float(np.sum(mono[e0:e1]**2))+1e-30
    return float(10*np.log10(early/direct))


def azimuth_metrics(ref, stage, sr, meta):
    targets=list(meta['azimuth_targets_deg'])
    ref_cues=[]; out_cues=[]
    for a in targets:
        name=f'az_{a:+d}'
        rr=meta_slice(ref,sr,meta,name); oo=meta_slice(stage,sr,meta,name)
        ref_cues.append([interaural_itd_us(rr,sr), interaural_ild_db(rr,sr)])
        out_cues.append([interaural_itd_us(oo,sr), interaural_ild_db(oo,sr)])
    R=np.asarray(ref_cues,float); O=np.asarray(out_cues,float); y=np.asarray(targets,float)
    # Calibrate cue->angle against the actual generated/captured input so analyzer
    # quantization/filter details do not masquerade as product localization error.
    X=np.column_stack([R, np.ones(len(R))])
    beta=np.linalg.lstsq(X,y,rcond=None)[0]
    pred_ref=X@beta
    pred_out=np.column_stack([O,np.ones(len(O))])@beta
    mae=float(np.mean(np.abs(pred_out-y)))
    center_idx=targets.index(0)
    sign_ok=[]
    for a,p in zip(targets,pred_out):
        if a==0: continue
        sign_ok.append(np.sign(a)==np.sign(p))
    rho=float(stats.spearmanr(y,pred_out).statistic)
    slope=float(np.polyfit(y,pred_out,1)[0])
    return {
        'targets_deg':targets,
        'input_proxy_deg':[round(float(x),3) for x in pred_ref],
        'output_proxy_deg':[round(float(x),3) for x in pred_out],
        'mean_abs_proxy_error_deg':round(mae,3),
        'center_drift_deg':round(abs(float(pred_out[center_idx])),3),
        'direction_sign_accuracy_pct':round(100*sum(sign_ok)/len(sign_ok),2),
        'monotonicity_spearman':round(rho,5),
        'lateralization_gain_slope':round(slope,5),
        'itd_mae_us':round(float(np.mean(np.abs(O[:,0]-R[:,0]))),3),
        'ild_mae_db':round(float(np.mean(np.abs(O[:,1]-R[:,1]))),3),
        'input_cues':[{'target_deg':a,'itd_us':round(c[0],3),'ild_db':round(c[1],3)} for a,c in zip(targets,R)],
        'output_cues':[{'target_deg':a,'itd_us':round(c[0],3),'ild_db':round(c[1],3)} for a,c in zip(targets,O)],
    }


def spatial_analysis():
    meta=json.loads((HERE/'spatial-localization-metadata.json').read_text())
    pre,sr=read_stereo(RESULTS/'spatial.pre-hrtf.wav')
    pre_sp,sr2=read_stereo(RESULTS/'spatial.pre-spatial.wav')
    post,sr3=read_stereo(RESULTS/'spatial.post.wav')
    if not (sr==sr2==sr3): raise RuntimeError('spatial tap sample-rate mismatch')
    lag_h=xcorr_lag(pre,pre_sp,sr,20); preA,h=align_pair(pre,pre_sp,lag_h)
    lag_s=xcorr_lag(pre,post,sr,30); preB,p=align_pair(pre,post,lag_s)
    n=min(len(preA),len(h),len(preB),len(p)); pre=preA[:n]; h=h[:n]; post=p[:n]
    az_hrtf=azimuth_metrics(pre,h,sr,meta)
    az_full=azimuth_metrics(pre,post,sr,meta)
    fb=template_classification(pre,post,sr,meta,['front_30','rear_30'])
    elev=template_classification(pre,post,sr,meta,['elev_-30','elev_0','elev_+30'])
    center_ref=meta_slice(pre,sr,meta,'center_broadband'); center_out=meta_slice(post,sr,meta,'center_broadband')
    imp_ref=meta_slice(pre,sr,meta,'center_impulse',trim=0.0); imp_out=meta_slice(post,sr,meta,'center_impulse',trim=0.0)
    side_delta=[]
    for a in meta['azimuth_targets_deg']:
        if a==0: continue
        name=f'az_{a:+d}'
        side_delta.append(side_mid_db(meta_slice(post,sr,meta,name))-side_mid_db(meta_slice(pre,sr,meta,name)))
    status={}
    spath=RESULTS/'spatial.status.json'
    if spath.exists(): status=json.loads(spath.read_text())
    sdiag=status.get('spatial3d') or {}
    warnings=[]; critical=[]
    if sdiag:
        if not str(sdiag.get('hrtfProfile','')).startswith('existing:'): warnings.append('runtime HRTF status was not existing:<profile>')
        if sdiag.get('resolvedDeviceProfile') not in (None,'generic-headphone'): warnings.append('runtime spatial profile was not generic-headphone')
    if az_full['direction_sign_accuracy_pct'] < 100: critical.append('azimuth cue polarity reversal detected')
    if az_full['monotonicity_spearman'] < 0.90: critical.append('azimuth cue ordering/monotonicity < 0.90')
    if az_full['center_drift_deg'] > 15: critical.append('center cue drift proxy > 15 deg')
    if az_full['mean_abs_proxy_error_deg'] > 30: critical.append('azimuth cue proxy mean absolute error > 30 deg')
    elif az_full['mean_abs_proxy_error_deg'] > 18: warnings.append('azimuth cue proxy mean absolute error > 18 deg')
    return {
        'gate':'PASS' if not critical else 'FAIL',
        'critical':critical,'warnings':warnings,
        'sample_rate':sr,
        'latency_prehrtf_to_prespatial_ms':round(lag_h*1000/sr,3),
        'latency_prehrtf_to_postspatial_ms':round(lag_s*1000/sr,3),
        'azimuth_hrtf_stage':az_hrtf,
        'azimuth_full_3d':az_full,
        'front_back_spectral_proxy':fb,
        'elevation_spectral_proxy':elev,
        'center_iacc_input':round(iacc(center_ref,sr),6),
        'center_iacc_output':round(iacc(center_out,sr),6),
        'center_iacc_delta':round(iacc(center_out,sr)-iacc(center_ref,sr),6),
        'mean_side_mid_expansion_db':round(float(np.mean(side_delta)),3),
        'early_reflection_ratio_input_db':round(early_reflection_ratio(imp_ref,sr),3),
        'early_reflection_ratio_output_db':round(early_reflection_ratio(imp_out,sr),3),
        'runtime_status':sdiag,
        'interpretation_note':'Objective localization-cue proxies only. They do not replace human listening/localization tests, especially for non-individual HRTF front/back and elevation performance.'
    }



def tone_amp_hann(x, sr, f):
    x=np.asarray(x,float)
    n=len(x)
    if n<8: return 0.0
    w=signal.windows.hann(n, sym=False)
    # Coherent-gain corrected RMS-scaled coefficient.
    t=np.arange(n)/sr
    c=np.sum((x*w)*np.exp(-2j*np.pi*f*t))
    cg=np.sum(w)
    return float(np.sqrt(2.0)*abs(c)/max(cg,1e-30))

def fit_fundamental(x,sr,f=1000):
    x=np.asarray(x,float); n=len(x); t=np.arange(n)/sr
    A=np.column_stack([np.sin(2*np.pi*f*t),np.cos(2*np.pi*f*t),np.ones(n)])
    coef=np.linalg.lstsq(A,x,rcond=None)[0]; fit=A@coef
    return fit, rms(fit-np.mean(fit)), x-fit


def thdn_db(x,sr,f=1000):
    fit,fund,res=fit_fundamental(x,sr,f)
    return db20(rms(res)/max(fund,1e-15))


def thd_harmonics(x,sr,f=1000,max_h=10):
    fund=tone_amp(x,sr,f); hs=[]
    p=0.0
    for h in range(2,max_h+1):
        hf=f*h
        if hf >= sr*0.45: break
        a=tone_amp(x,sr,hf); p+=a*a
        hs.append({'harmonic':h,'freq_hz':hf,'dbc':round(db20(a/max(fund,1e-15)),3)})
    return db20(math.sqrt(p)/max(fund,1e-15)), hs


def a_weight_filter(x,sr):
    f1=20.598997; f2=107.65265; f3=737.86223; f4=12194.217
    w=lambda f:2*np.pi*f
    z=np.array([0,0,0,0],float)
    p=np.array([-w(f1),-w(f1),-w(f2),-w(f3),-w(f4),-w(f4)],float)
    # Analog gain chosen for 0 dB at 1 kHz, then bilinear transformed.
    s=1j*w(1000.0)
    k=abs(np.prod(s-p)/np.prod(s-z))
    zd,pd,kd=signal.bilinear_zpk(z,p,k,fs=sr)
    sos=signal.zpk2sos(zd,pd,kd)
    return signal.sosfilt(sos,np.asarray(x,float),axis=0)


def amp_multitone(ref,out,sr,meta):
    rr=meta_slice(ref,sr,meta,'multitone'); oo=meta_slice(out,sr,meta,'multitone')
    freqs=meta['multitone_freqs_hz']; gains=[]; phases=[]
    for f in freqs:
        vals=[]; ph=[]
        for ch in range(2):
            rc=tone_complex(rr[:,ch],sr,f); oc=tone_complex(oo[:,ch],sr,f)
            vals.append(20*np.log10(max(abs(oc),1e-15)/max(abs(rc),1e-15)))
            ph.append(((np.angle(oc*np.conj(rc),deg=True)+180)%360)-180)
        gains.append(float(np.mean(vals))); phases.append(float(np.mean(ph)))
    off=float(np.median(gains)); flat=float(np.max(np.abs(np.asarray(gains)-off)))
    return freqs,gains,phases,off,flat


def crosstalk_db(seg, own_ch, cross_ch, sr, f=1000):
    own=tone_amp(seg[:,own_ch],sr,f); cross=tone_amp(seg[:,cross_ch],sr,f)
    return db20(cross/max(own,1e-15))


def ccif_imd(seg,sr):
    mono=np.mean(seg,axis=1); ref=(tone_amp_hann(mono,sr,19000)+tone_amp_hann(mono,sr,20000))/2
    return db20(tone_amp_hann(mono,sr,1000)/max(ref,1e-15))


def smpte_imd(seg,sr):
    mono=np.mean(seg,axis=1); carrier=tone_amp_hann(mono,sr,7000)
    side=[tone_amp_hann(mono,sr,f) for f in (6880,6940,7060,7120)]
    return db20(math.sqrt(sum(a*a for a in side))/max(carrier,1e-15))


def true_peak_dbfs(x, factor=8):
    y=signal.resample_poly(x,factor,1,axis=0)
    return db20(np.max(np.abs(y)))


def band_noise_dbfs(x,sr,lo,hi):
    try: z=bandpass(x,sr,lo,min(hi,sr*.45),order=3)
    except Exception: z=x
    return db20(rms(z))


def amp_analysis():
    meta=json.loads((HERE/'amp-benchmark-metadata.json').read_text())
    pre,sr=read_stereo(RESULTS/'amp.pre.wav'); post,sr2=read_stereo(RESULTS/'amp.post.wav'); final,sr3=read_stereo(RESULTS/'amp.final.wav')
    if not (sr==sr2==sr3): raise RuntimeError('amp tap sample-rate mismatch')
    lag=xcorr_lag(pre,post,sr,10); pre,post=align_pair(pre,post,lag)
    lag_final=xcorr_lag(post,final,sr,20); post2,final=align_pair(post,final,lag_final)
    n=min(len(pre),len(post),len(post2),len(final)); pre=pre[:n];post=post[:n];final=final[:n]
    rated=meta_slice(post,sr,meta,'rated_1k'); rated_pre=meta_slice(pre,sr,meta,'rated_1k')
    low=meta_slice(post,sr,meta,'low_1k'); low_pre=meta_slice(pre,sr,meta,'low_1k')
    silence=post[:int(.45*sr)]
    fund_rms=float(np.mean([fit_fundamental(rated[:,ch],sr)[1] for ch in range(2)]))
    snr=db20(fund_rms/max(rms(silence),1e-15)); snr_a=db20(fund_rms/max(rms(a_weight_filter(silence,sr)),1e-15))
    thdns=[thdn_db(rated[:,ch],sr) for ch in range(2)]
    thds=[]; harmonics=[]
    for ch in range(2):
        td,hs=thd_harmonics(rated[:,ch],sr); thds.append(td); harmonics.append(hs)
    gain_rated=db20(rms(rated)/max(rms(rated_pre),1e-15)); gain_low=db20(rms(low)/max(rms(low_pre),1e-15))
    freqs,gains,phases,fr_off,fr_flat=amp_multitone(pre,post,sr,meta)
    left=meta_slice(post,sr,meta,'left_only_1k'); right=meta_slice(post,sr,meta,'right_only_1k')
    transient=meta_slice(post,sr,meta,'transient'); transient_pre=meta_slice(pre,sr,meta,'transient')
    near=meta_slice(post,sr,meta,'nearfull_997',trim=.03)
    ccif=ccif_imd(meta_slice(post,sr,meta,'ccif_19_20'),sr)
    smpte=smpte_imd(meta_slice(post,sr,meta,'smpte_60_7k'),sr)
    dc=float(np.mean(silence)); nonfinite=int(post.size-np.count_nonzero(np.isfinite(post))); clips=int(np.count_nonzero(np.abs(post)>=1.0))
    status={}; p=RESULTS/'amp.status.json'
    if p.exists(): status=json.loads(p.read_text())
    adiag=status.get('virtualAmp') or {}
    critical=[]; warnings=[]
    if adiag:
        if adiag.get('backend')!='cpp-wasm': critical.append('Virtual Amp backend is not cpp-wasm')
        if not adiag.get('effectiveEnabled'): critical.append('Virtual Amp was not effectively enabled')
        if adiag.get('error'): critical.append(f"Virtual Amp runtime fault: {adiag.get('error')}")
    if nonfinite: critical.append('amp output contains non-finite samples')
    if clips: critical.append('amp output contains clipped samples')
    if max(thdns) > -90: critical.append('amp-only THD+N worse than -90 dB')
    if snr_a < 110: critical.append('amp A-weighted S/N < 110 dB')
    if fr_flat > .05: critical.append('amp FR flatness deviation > 0.05 dB')
    if abs(gain_rated) > .05: critical.append('amp rated-level gain error > 0.05 dB')
    if max(crosstalk_db(left,0,1,sr), crosstalk_db(right,1,0,sr)) > -100: critical.append('amp crosstalk worse than -100 dB')
    if abs(lag*1000/sr) > 3.5: critical.append('amp measured added latency > 3.5 ms')
    elif abs(lag*1000/sr) > 1.0: warnings.append('amp measured added latency > 1 ms')
    return {
        'gate':'PASS' if not critical else 'FAIL','critical':critical,'warnings':warnings,'sample_rate':sr,
        'runtime_status':adiag,
        'added_latency_samples':lag,'added_latency_ms':round(lag*1000/sr,4),
        'postamp_to_final_latency_ms':round(lag_final*1000/sr,4),
        'gain_error_rated_db':round(gain_rated,6),'gain_error_low_level_db':round(gain_low,6),'dynamic_linearity_error_db':round(gain_low-gain_rated,6),
        'thdn_db_lr':[round(float(x),3) for x in thdns], 'thd_db_lr':[round(float(x),3) for x in thds], 'harmonics_dbc_lr':harmonics,
        'snr_unweighted_db':round(snr,3),'snr_a_weighted_db':round(snr_a,3),
        'noise_floor_dbfs':round(db20(rms(silence)),3),
        'noise_bands_dbfs':{
            '20_200':round(band_noise_dbfs(silence,sr,20,200),3),
            '200_2000':round(band_noise_dbfs(silence,sr,200,2000),3),
            '2000_20000':round(band_noise_dbfs(silence,sr,2000,20000),3)},
        'ccif_19_20_imd_1k_db':round(ccif,3),'smpte_60_7k_imd_db':round(smpte,3),
        'fr_freqs_hz':freqs,'fr_gain_db':[round(x,6) for x in gains],'fr_phase_deg':[round(x,5) for x in phases],
        'fr_offset_db':round(fr_off,6),'fr_flatness_db':round(fr_flat,6),'max_abs_phase_error_deg':round(float(np.max(np.abs(phases))),5),
        'crosstalk_l_to_r_db':round(crosstalk_db(left,0,1,sr),3),'crosstalk_r_to_l_db':round(crosstalk_db(right,1,0,sr),3),
        'dc_offset_dbfs':round(db20(abs(dc)),3),'dc_offset_normalized':dc,
        'transient_peak_delta_db':round(db20(np.max(np.abs(transient))/max(np.max(np.abs(transient_pre)),1e-15)),5),
        'nearfull_peak_dbfs':round(db20(np.max(np.abs(near))),3),'nearfull_true_peak_dbfs':round(true_peak_dbfs(near),3),
        'nonfinite_samples':nonfinite,'clip_samples':clips,
        'reference_model_note':'Rated/max wattage, output impedance, damping factor and slew-rate-equivalent are software reference electrical-model values; the waveform measurements above are the actual Web Audio C++/WASM stage measurements.'
    }

def low_frequency_residual_db(seg, sr, f=1000):
    mono=np.mean(seg,axis=1)
    fit,fund,res=fit_fundamental(mono,sr,f)
    if len(res)<16: return -300.0
    sos=signal.butter(4, min(20.0/(sr/2),0.99), btype='lowpass', output='sos')
    low=signal.sosfiltfilt(sos,res)
    return db20(rms(low)/max(fund,1e-15))


def stage_quality(seg, sr):
    seg=np.asarray(seg,float)
    seg=seg[int(0.12*sr):int(0.88*sr)] if len(seg)>int(0.9*sr) else seg
    mono=np.mean(seg,axis=1)
    td=thdn_db(mono,sr,1000)
    thd,_=thd_harmonics(mono,sr,1000)
    imd=ccif_imd(seg,sr)
    corr=float(np.corrcoef(seg[:,0],seg[:,1])[0,1]) if len(seg)>2 else 0.0
    return {
      'thdn_db':round(td,3),'thd_db':round(thd,3),'ccif_imd_db':round(imd,3),
      'low_frequency_residual_db':round(low_frequency_residual_db(seg,sr),3),
      'lr_correlation':round(corr,6),'rms_dbfs':round(db20(rms(seg)),3)
    }


def sonobus_analysis():
    names=['pre-hrtf','post-hrtf','post-spatial','final']
    data={}; sr=None
    for n in names:
        x,s=read_stereo(RESULTS/f'sonobus.{n}.wav')
        if sr is None: sr=s
        elif sr!=s: raise RuntimeError('SonoBus stage tap sample-rate mismatch')
        data[n]=x
    # Align all stages to pre-HRTF so changes are not mistaken for transport offsets.
    ref=data['pre-hrtf']; aligned={'pre-hrtf':ref}; lat={}
    for n in names[1:]:
        lag=xcorr_lag(ref,data[n],sr,30); r,o=align_pair(ref,data[n],lag)
        m=min(len(r),len(o)); ref=r[:m]; aligned[n]=o[:m]; lat[n]=round(lag*1000/sr,4)
    # Quality stimulus sine and two-tone segments use the same timing as metrics.py.
    import metrics as base_metrics
    stages={}
    for n in names:
        x=aligned.get(n,data[n])
        sine=base_metrics.slice_seg(x,sr,'sine')
        twotone=base_metrics.slice_seg(x,sr,'twotone')
        q=stage_quality(sine,sr)
        q['ccif_imd_db']=round(base_metrics.imd_19_20(twotone,sr),3)
        stages[n]=q
    status={}; sp=RESULTS/'sonobus.status.json'
    if sp.exists(): status=json.loads(sp.read_text())
    return {
      'gate':'PASS','critical':[],'warnings':[], 'sample_rate':sr,
      'latency_ms_from_pre_hrtf':lat, 'stages':stages,
      'runtime_spatial':status.get('spatial3d') or {},
      'runtime_hrtf_effective':bool(status.get('hrtfEffectiveEnabled')),
      'interpretation_note':'Stage-isolation diagnostic only. It identifies where THD+N/IMD/residual changes appear; it does not itself prove the causal mechanism.'
    }

def render_report(report):
    lines=['# YURIKA Specialized Spatial / Virtual Amp Report','',f"Specialized gate: **{report['gate']}**",'']
    s=report.get('spatial')
    if s and not s.get('skipped'):
        lines += [
           '## 3D localization cue performance (objective proxies)','',
           '> These are objective cue-retention/localization proxies, not a human MOS or a claim of individualized-HRTF localization accuracy.','',
           '| Metric | HRTF stage | Full HRTF + Spatial |','|---|---:|---:|',
           f"| Azimuth cue-proxy MAE | {s['azimuth_hrtf_stage']['mean_abs_proxy_error_deg']:.2f}° | {s['azimuth_full_3d']['mean_abs_proxy_error_deg']:.2f}° |",
           f"| Center drift proxy | {s['azimuth_hrtf_stage']['center_drift_deg']:.2f}° | {s['azimuth_full_3d']['center_drift_deg']:.2f}° |",
           f"| Direction-sign accuracy | {s['azimuth_hrtf_stage']['direction_sign_accuracy_pct']:.1f}% | {s['azimuth_full_3d']['direction_sign_accuracy_pct']:.1f}% |",
           f"| Azimuth monotonicity (Spearman) | {s['azimuth_hrtf_stage']['monotonicity_spearman']:.3f} | {s['azimuth_full_3d']['monotonicity_spearman']:.3f} |",
           f"| Lateralization gain slope | {s['azimuth_hrtf_stage']['lateralization_gain_slope']:.3f} | {s['azimuth_full_3d']['lateralization_gain_slope']:.3f} |",
           f"| ITD cue MAE | {s['azimuth_hrtf_stage']['itd_mae_us']:.1f} µs | {s['azimuth_full_3d']['itd_mae_us']:.1f} µs |",
           f"| ILD cue MAE | {s['azimuth_hrtf_stage']['ild_mae_db']:.2f} dB | {s['azimuth_full_3d']['ild_mae_db']:.2f} dB |",'',
           '### Front/back, elevation, externalization proxies','',
           f"- Front/back spectral-template separability: **{s['front_back_spectral_proxy']['accuracy_pct']:.1f}%**, mean spectral correlation {s['front_back_spectral_proxy']['mean_spectral_corr']:.3f}",
           f"- Elevation spectral-template separability: **{s['elevation_spectral_proxy']['accuracy_pct']:.1f}%**, mean spectral correlation {s['elevation_spectral_proxy']['mean_spectral_corr']:.3f}",
           f"- Center IACC: {s['center_iacc_input']:.4f} → {s['center_iacc_output']:.4f} (Δ {s['center_iacc_delta']:+.4f})",
           f"- Mean Side/Mid expansion: {s['mean_side_mid_expansion_db']:+.2f} dB",
           f"- Early-reflection energy ratio: {s['early_reflection_ratio_input_db']:.2f} → {s['early_reflection_ratio_output_db']:.2f} dB",
           f"- Measured pre-HRTF → post-Spatial alignment latency: {s['latency_prehrtf_to_postspatial_ms']:.3f} ms",''
        ]
    else:
        lines += ['## 3D localization cue performance','','Specialized Spatial bench: **SKIPPED** (candidate does not expose the required Spatial/HRTF feature set).','']

    so=report.get('sonobus')
    if so and not so.get('skipped'):
        lines += ['## SonoBus Mobile stage-isolation diagnostic','',
                  '> This is a debug breakdown of the dataset-free remote binaural path. It does not replace the normal final-output quality profile.','',
                  '| Stage | THD+N dB | THD dB | CCIF IMD dB | <20 Hz residual / fundamental dB | L/R corr |','|---|---:|---:|---:|---:|---:|']
        for key,label in [('pre-hrtf','Pre HRTF'),('post-hrtf','Post HRTF'),('post-spatial','Post Spatial'),('final','Final')]:
            q=so['stages'][key]
            lines.append(f"| {label} | {q['thdn_db']:.2f} | {q['thd_db']:.2f} | {q['ccif_imd_db']:.2f} | {q['low_frequency_residual_db']:.2f} | {q['lr_correlation']:.4f} |")
        lines += ['',f"- Runtime HRTF effective: **{so['runtime_hrtf_effective']}**",f"- Runtime Spatial profile: `{so['runtime_spatial'].get('resolvedDeviceProfile','unknown')}`",'']
    else:
        lines += ['## SonoBus Mobile stage-isolation diagnostic','','SonoBus diagnostic: **SKIPPED**.','']

    a=report.get('amp')
    if a and not a.get('skipped'):
        lines += [
           '## Virtual Class-A Amp detailed bench','',
           '| Metric | Measured |','|---|---:|',
           f"| Runtime sample rate | {a['sample_rate']} Hz |",f"| Amp-added alignment latency | {a['added_latency_ms']:.4f} ms |",
           f"| Rated-level gain error | {a['gain_error_rated_db']:+.6f} dB |",f"| Low-level gain error | {a['gain_error_low_level_db']:+.6f} dB |",f"| Dynamic linearity error | {a['dynamic_linearity_error_db']:+.6f} dB |",
           f"| THD+N L/R | {a['thdn_db_lr'][0]:.2f} / {a['thdn_db_lr'][1]:.2f} dB |",f"| THD L/R | {a['thd_db_lr'][0]:.2f} / {a['thd_db_lr'][1]:.2f} dB |",
           f"| S/N unweighted | {a['snr_unweighted_db']:.2f} dB |",f"| S/N A-weighted | {a['snr_a_weighted_db']:.2f} dB(A) |",
           f"| CCIF 19/20 kHz IMD (1 kHz product) | {a['ccif_19_20_imd_1k_db']:.2f} dB |",f"| SMPTE 60 Hz / 7 kHz IMD | {a['smpte_60_7k_imd_db']:.2f} dB |",
           f"| FR offset | {a['fr_offset_db']:+.5f} dB |",f"| FR flatness | {a['fr_flatness_db']:.5f} dB |",f"| Max phase error | {a['max_abs_phase_error_deg']:.4f}° |",
           f"| Crosstalk L→R / R→L | {a['crosstalk_l_to_r_db']:.2f} / {a['crosstalk_r_to_l_db']:.2f} dB |",
           f"| DC offset | {a['dc_offset_dbfs']:.2f} dBFS |",f"| Transient peak Δ | {a['transient_peak_delta_db']:+.5f} dB |",
           f"| Near-full-scale peak / true peak | {a['nearfull_peak_dbfs']:.2f} / {a['nearfull_true_peak_dbfs']:.2f} dBFS |",'',
           '### Amp multitone transfer','',
           '| Hz | ' + ' | '.join(str(x) for x in a['fr_freqs_hz']) + ' |',
           '|---|'+'|'.join(['---:']*len(a['fr_freqs_hz']))+'|',
           '| Gain dB | '+' | '.join(f"{x:+.4f}" for x in a['fr_gain_db'])+' |',
           '| Phase ° | '+' | '.join(f"{x:+.3f}" for x in a['fr_phase_deg'])+' |','',
           '> The amplifier electrical wattage/impedance/damping/slew figures are reference-model metadata. THD, THD+N, S/N, IMD, transfer response, crosstalk, DC, transient and latency values above are measured from the rendered C++/WASM Web Audio stage.'
        ]
    else:
        lines += ['## Virtual Class-A Amp detailed bench','','Virtual Amp bench: **SKIPPED** (candidate does not expose the C++/WASM Virtual Amp feature set).','']
    if report['warnings']:
        lines += ['', '## Specialized warnings']+[f'- {x}' for x in report['warnings']]
    if report['critical']:
        lines += ['', '## Specialized critical findings']+[f'- {x}' for x in report['critical']]
    return '\n'.join(lines)+'\n'


def main():
    caps_path=RESULTS/'specialized-capabilities.json'
    caps={'spatial':(RESULTS/'spatial.post.wav').exists(),'virtualAmp':(RESULTS/'amp.post.wav').exists(),'sonobus':(RESULTS/'sonobus.final.wav').exists()}
    if caps_path.exists():
        try: caps.update(json.loads(caps_path.read_text()))
        except Exception: pass
    spatial=spatial_analysis() if caps.get('spatial') and (RESULTS/'spatial.post.wav').exists() else {'gate':'SKIP','critical':[],'warnings':[],'skipped':True}
    sonobus=sonobus_analysis() if caps.get('sonobus') and (RESULTS/'sonobus.final.wav').exists() else {'gate':'SKIP','critical':[],'warnings':[],'skipped':True}
    amp=amp_analysis() if caps.get('virtualAmp') and (RESULTS/'amp.post.wav').exists() else {'gate':'SKIP','critical':[],'warnings':[],'skipped':True}
    critical=[f"spatial: {x}" for x in spatial.get('critical',[])]+[f"amp: {x}" for x in amp.get('critical',[])]
    warnings=[f"spatial: {x}" for x in spatial.get('warnings',[])]+[f"sonobus: {x}" for x in sonobus.get('warnings',[])]+[f"amp: {x}" for x in amp.get('warnings',[])]
    report={'gate':'PASS' if not critical else 'FAIL','critical':critical,'warnings':warnings,'capabilities':caps,'spatial':spatial,'sonobus':sonobus,'amp':amp,
            'notes':['3D localization results are objective acoustic-cue proxies. Human localization requires listening tests, and non-individual HRTF front/back/elevation performance is listener dependent.']}
    RESULTS.mkdir(parents=True,exist_ok=True)
    (RESULTS/'specialized-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
    md=render_report(report); (RESULTS/'specialized-report.md').write_text(md,encoding='utf-8'); print(md)
    return 0 if report['gate']=='PASS' else 1

if __name__=='__main__':
    sys.exit(main())
