from __future__ import annotations
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errs=[]
def req(c,m):
    if not c: errs.append(m)
def txt(rel):
    p=ROOT/rel; req(p.exists(),f'missing: {rel}'); return p.read_text(encoding='utf-8-sig',errors='replace') if p.exists() else ''
wf=txt('.github/workflows/audio-quality.yml')
meta=json.loads(txt('.yurika-test-candidate.json') or '{}')
req(meta.get('evaluator')=='YURIKA_FINE_BWE_SR_ACTUAL_GRAPH_V1','evaluator id mismatch')
req(meta.get('layout')=='v3-root','layout mismatch')
for token in [
 'python tests/candidate_static_test.py',
 'python tests/ci_ai_sr_wiring_test.py',
 'python tools/audio_quality_eval.py --selftest',
 'python tests/audio_quality/generate_ai_sr_stimulus.py',
 'node tests/audio_quality/run_playwright.mjs',
 'python tests/audio_quality/run_fine_reports.py',
 'tests/audio_quality/results/fine-report.md',
 'actions/checkout@v7',
 'actions/setup-python@v7',
 'actions/setup-node@v5',
 'actions/upload-artifact@v6']:
    req(token in wf,f'workflow wiring missing: {token}')
rt=txt('tests/audio_quality/runtime.js')
req('aiHiResEnabled=true' in rt and 'aiHiResAmount=40' in rt and 'aiHiResAmount=80' in rt,'AI profile wiring missing')
req('sampleRate:96000' in rt,'96k runtime request missing')
runner=txt('tests/audio_quality/run_playwright.mjs')
for name in ['lowband-neutral96','lowband-ai40','lowband-ai80','nativehf-ai40']:
    req(name in runner,f'render job missing: {name}')
print(json.dumps({'ok':not errs,'layout':'v3-root','version':meta.get('version'),'evaluator':meta.get('evaluator'),'errors':errs},ensure_ascii=False,indent=2))
sys.exit(1 if errs else 0)
