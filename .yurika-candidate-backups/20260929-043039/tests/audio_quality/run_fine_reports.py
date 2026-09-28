from __future__ import annotations
import json, subprocess, sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
EVAL=ROOT/'tools'/'audio_quality_eval.py'
RES=HERE/'results'
RES.mkdir(parents=True,exist_ok=True)
JOBS=[
 ('lowband-ai40', HERE/'quality-stimulus-lowband.wav'),
 ('lowband-ai80', HERE/'quality-stimulus-lowband.wav'),
 ('nativehf-ai40', HERE/'quality-stimulus-nativehf.wav'),
 ('lowband-neutral96', HERE/'quality-stimulus-lowband.wav'),
]
reports={}
for name,ref in JOBS:
    proc=RES/f'{name}.wav'
    if not proc.exists():
        raise SystemExit(f'missing rendered WAV: {proc}')
    out_json=RES/f'{name}-fine.json'; out_txt=RES/f'{name}-fine.txt'; out_csv=RES/f'{name}-fine.csv'
    cmd=[sys.executable,str(EVAL),'--reference',str(ref),'--processed',str(proc),'--max-seconds','30','--window-seconds','5','--json',str(out_json),'--text',str(out_txt),'--csv',str(out_csv),'--fail-on-safety']
    print('RUN',' '.join(cmd))
    subprocess.run(cmd,check=True)
    reports[name]=json.loads(out_json.read_text(encoding='utf-8'))

def g(d,*keys,default=None):
    for k in keys:
        if not isinstance(d,dict): return default
        d=d.get(k)
    return default if d is None else d

lines=['# YURIKA 3.7.0 AI Bandwidth + Perceptual SR Fine Report','',
       'These are engineering regression/proxy measurements from the actual Chromium extension graph. They are not MOS or proof of exact restoration.','',
       '| Render | In-band SI-SDR <20k | SR Fidelity | Transient Integrity | HF/source dB | Added >24k RMS dBFS | BWE Structure | Cutoff jump dB | Native HF retention dB | Stereo Integrity | Safety |',
       '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|']
for name,r in reports.items():
    core=r['core_fidelity']; sr=r['perceptual_super_resolution']; bwe=r['bandwidth_extension']; st=r['stereo_spatial_integrity']; saf=r['safety']
    retention=bwe.get('native_hf_retention_db')
    ret='n/a' if retention is None else f'{retention:.2f}'
    lines.append(f"| {name} | {core.get('inband_si_sdr_db_below_20k',0):.2f} | {sr.get('sr_fidelity_index',0):.2f} | {sr.get('transient_integrity_index',0):.2f} | {bwe.get('processed_hf_to_source_db',0):.2f} | {bwe.get('added_hf_rms_dbfs_above_24k',0):.2f} | {bwe.get('bwe_structure_index',0):.2f} | {bwe.get('cutoff_continuity_jump_db',0):.2f} | {ret} | {st.get('stereo_integrity_index',0):.2f} | {saf.get('safety_flag_count',0)} |")
lines += ['', '## Interpretation guards',
          '- Compare `lowband-ai40` / `lowband-ai80` against `lowband-neutral96` to separate intentional BWE from in-band damage.',
          '- `nativehf-ai40` is primarily for native-HF retention/protection behavior.',
          '- BWE Structure is a structure proxy, not historical-source reconstruction accuracy.',
          '- No single overall sound-quality score is produced.']
(RES/'fine-report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(RES/'fine-report-index.json').write_text(json.dumps({k:{'json':f'{k}-fine.json','text':f'{k}-fine.txt','csv':f'{k}-fine.csv'} for k in reports},indent=2),encoding='utf-8')
print('\n'.join(lines))
