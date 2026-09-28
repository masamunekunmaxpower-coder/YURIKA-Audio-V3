from __future__ import annotations
import json, re, sys, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def req(c,m):
    if not c: errors.append(m)
manifest=ROOT/'manifest.json'
req(manifest.exists(),'manifest.json missing at repository root')
if manifest.exists():
    try: m=json.loads(manifest.read_text(encoding='utf-8-sig'))
    except Exception as e: m={}; errors.append(f'manifest invalid: {e}')
    req(m.get('manifest_version')==3,'manifest_version must be 3')
    req(m.get('version')=='3.7.0',f"expected extension 3.7.0, got {m.get('version')!r}")
for rel in [
 'ai-hires.js','ai-hires-worklet.js','hires-hybrid-core.wasm',
 'dart-detector/dart-detector-runtime.js','controller-training/controller_weights.json',
 'matlab-numeric/hires_frequency_resolution_design.m',
 'tests/audio_quality/runtime.html','tests/audio_quality/run_playwright.mjs',
 'tools/audio_quality_eval.py','.github/workflows/audio-quality.yml',
 '.yurika-test-candidate.json','.yurika-test-candidate-files.json']:
    req((ROOT/rel).exists(),f'missing: {rel}')
meta=ROOT/'.yurika-test-candidate.json'
md={}
if meta.exists():
    try: md=json.loads(meta.read_text(encoding='utf-8-sig'))
    except Exception as e: errors.append(f'candidate metadata invalid: {e}')
    req(md.get('version')=='3.7.0',f"candidate version mismatch: {md.get('version')!r}")
    req(md.get('evaluator')=='YURIKA_FINE_BWE_SR_ACTUAL_GRAPH_V1','candidate evaluator id mismatch')
    req(md.get('layout')=='v3-root','candidate layout must be v3-root')
files_meta=ROOT/'.yurika-test-candidate-files.json'
managed=[]
if files_meta.exists():
    try: managed=json.loads(files_meta.read_text(encoding='utf-8-sig'))
    except Exception as e: errors.append(f'candidate file list invalid: {e}')
    req(isinstance(managed,list) and len(managed)>0,'candidate managed file list empty')
    for rel in managed:
        req((ROOT/rel).is_file(),f'managed file missing: {rel}')
    if md:
        req(md.get('managedFileCount')==len(managed),f"managedFileCount mismatch: {md.get('managedFileCount')} != {len(managed)}")
        h=hashlib.sha256()
        for rel in managed:
            if rel=='.yurika-test-candidate.json': continue
            q=ROOT/rel
            if not q.is_file(): continue
            h.update(rel.encode('utf-8')); h.update(b'\0'); h.update(hashlib.sha256(q.read_bytes()).digest()); h.update(b'\0')
        req(md.get('sha256')==h.hexdigest(),f"managed tree SHA mismatch: {h.hexdigest()}")
# Production JavaScript safety scan: repo-root extension files and production subdirs only.
for p in list(ROOT.glob('*.js')) + list((ROOT/'dart-detector').rglob('*.js')):
    if not p.is_file(): continue
    rel=p.relative_to(ROOT).as_posix()
    txt=p.read_text(encoding='utf-8-sig',errors='replace')
    if re.search(r'\beval\s*\(|\bnew\s+Function\s*\(',txt): errors.append(f'dynamic code execution forbidden: {rel}')
print(json.dumps({'ok':not errors,'layout':'v3-root','errors':errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
