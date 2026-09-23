from pathlib import Path
import json, os, shutil, subprocess, sys, tempfile
HERE=Path(__file__).resolve().parent
ref=HERE/'quality-stimulus.wav'
if not ref.exists():
    subprocess.run([sys.executable, str(HERE/'generate_stimulus.py')], check=True)
with tempfile.TemporaryDirectory(prefix='yurika-quality-selftest-') as td:
    out=Path(td)
    for p in ['neutral','clean','music','selfdap']:
        shutil.copy2(ref, out/f'{p}.wav')
        (out/f'{p}.status.json').write_text('{}', encoding='utf-8')
    env=os.environ.copy(); env['YURIKA_RESULTS_DIR']=str(out); env['YURIKA_REF_FILE']=str(ref)
    cp=subprocess.run([sys.executable, str(HERE/'metrics.py')], env=env, text=True, capture_output=True)
    if cp.returncode != 0:
        print(cp.stdout); print(cp.stderr, file=sys.stderr); raise SystemExit('metrics identity self-test failed')
    report=json.loads((out/'report.json').read_text(encoding='utf-8'))
    n=report['profiles']['neutral']
    checks={
        'gate_pass': report['gate']=='PASS',
        'si_sdr_identity': n['si_sdr_db']>100,
        'lsd_identity': abs(n['lsd_db'])<1e-6,
        'fr_identity': max(abs(x) for x in n['multitone_db'])<1e-6,
        'phase_identity': max(abs(x) for x in n['multitone_phase_deg'])<1e-5,
        'latency_identity': n['latency_samples']==0,
        'no_clipping': n['clip_samples']==0,
    }
    bad=[k for k,v in checks.items() if not v]
    if bad:
        print(json.dumps({'checks':checks,'neutral':n},indent=2)); raise SystemExit('self-test failed: '+', '.join(bad))
    print('PASS analyzer_selftest', ', '.join(checks))
