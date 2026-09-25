from __future__ import annotations
import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]; notes=[]
def fail(x): errors.append(x)
def ok(cond,msg):
    if not cond: fail(msg)
manifest_path=ROOT/'manifest.json'
ok(manifest_path.exists(),'manifest.json missing')
if manifest_path.exists():
    try: manifest=json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    except Exception as e: manifest={}; fail(f'manifest invalid: {e}')
    ok(manifest.get('manifest_version')==3,'manifest_version must be 3')
    ok(bool(manifest.get('version')),'manifest version missing')
    sw=((manifest.get('background') or {}).get('service_worker'))
    if sw: ok((ROOT/sw).exists(),f'service worker missing: {sw}')
    popup=((manifest.get('action') or {}).get('default_popup'))
    if popup: ok((ROOT/popup).exists(),f'popup missing: {popup}')

protected=['.github/workflows/audio-quality.yml','tests/audio_quality/runtime.html','tests/audio_quality/runtime.js','tests/audio_quality/run_playwright.mjs','tests/audio_quality/metrics.py']
for rel in protected: ok((ROOT/rel).exists(),f'evaluator file missing: {rel}')

# Candidate production scan. Evaluator/tests/docs are intentionally excluded.
for path in ROOT.rglob('*'):
    if not path.is_file(): continue
    rel=path.relative_to(ROOT).as_posix()
    if rel.startswith(('.git/','.github/','tests/','audio_quality/','YURIKA_FINAL_')): continue
    if path.suffix.lower() not in {'.js','.html','.json'}: continue
    try: text=path.read_text(encoding='utf-8-sig',errors='replace')
    except Exception: continue
    if path.suffix.lower()=='.js':
        if re.search(r'\beval\s*\(|\bnew\s+Function\s*\(',text): fail(f'dynamic code execution forbidden: {rel}')
        if re.search(r'https?://',text) and 'headphone-profiles.js' not in rel:
            # URL strings may be documentation/source metadata in headphone profiles; production network calls are checked separately.
            if re.search(r'\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b',text): fail(f'production network API found: {rel}')
    if path.suffix.lower()=='.html':
        if re.search(r'<script[^>]+src=["\']https?://',text,re.I): fail(f'external script CDN forbidden: {rel}')

meta=ROOT/'.yurika-test-candidate.json'
if meta.exists():
    try: notes.append(json.loads(meta.read_text(encoding='utf-8-sig')))
    except Exception as e: fail(f'candidate metadata invalid: {e}')
print(json.dumps({'ok':not errors,'errors':errors,'candidate':notes[-1] if notes else None},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
