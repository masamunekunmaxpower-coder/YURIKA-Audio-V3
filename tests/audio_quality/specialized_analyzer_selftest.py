from __future__ import annotations

import json
from pathlib import Path
import numpy as np
import soundfile as sf

import specialized_metrics as m

HERE=Path(__file__).resolve().parent
sp_meta=json.loads((HERE/'spatial-localization-metadata.json').read_text())
sp,sr=sf.read(HERE/'spatial-localization-stimulus.wav',always_2d=True,dtype='float64')

az=m.azimuth_metrics(sp,sp,sr,sp_meta)
assert az['mean_abs_proxy_error_deg'] < 1.0, az
assert az['center_drift_deg'] < 1.0, az
assert az['direction_sign_accuracy_pct'] == 100.0, az
assert az['monotonicity_spearman'] > 0.99, az
fb=m.template_classification(sp,sp,sr,sp_meta,['front_30','rear_30'])
el=m.template_classification(sp,sp,sr,sp_meta,['elev_-30','elev_0','elev_+30'])
assert fb['accuracy_pct']==100.0, fb
assert el['accuracy_pct']==100.0, el

amp_meta=json.loads((HERE/'amp-benchmark-metadata.json').read_text())
a,sra=sf.read(HERE/'amp-benchmark-stimulus.wav',always_2d=True,dtype='float64')
assert sra==sr
freqs,gains,phases,off,flat=m.amp_multitone(a,a,sr,amp_meta)
assert abs(off)<1e-6 and flat<1e-6
assert max(abs(x) for x in phases)<1e-5
assert m.ccif_imd(m.meta_slice(a,sr,amp_meta,'ccif_19_20'),sr) < -100
assert m.smpte_imd(m.meta_slice(a,sr,amp_meta,'smpte_60_7k'),sr) < -90
print(json.dumps({'ok':True,'azimuth_identity_mae_deg':az['mean_abs_proxy_error_deg'],'front_back_identity_pct':fb['accuracy_pct'],'elevation_identity_pct':el['accuracy_pct'],'amp_identity_fr_flatness_db':flat},indent=2))
