from __future__ import annotations
import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]
def require(cond,msg):
    if not cond: errors.append(msg)

def text(rel):
    p=ROOT/rel
    require(p.exists(),f"missing: {rel}")
    return p.read_text(encoding="utf-8-sig",errors="replace") if p.exists() else ""

wf=text('.github/workflows/audio-quality.yml')
meta_text=text('.yurika-test-candidate.json')
try: meta=json.loads(meta_text)
except Exception as e:
    meta={}; errors.append(f'candidate metadata invalid: {e}')
require(meta.get('version')=='3.5.1',f"candidate version must be 3.5.1, got {meta.get('version')!r}")
require(meta.get('evaluator')=='YURIKA_AUDIO_QUALITY_V2_8_R5_HALL_CI_WIRED','candidate evaluator id mismatch')

required_workflow_tokens=[
 'python tests/ci_extended_bench_wiring_test.py',
 'node tests/stem_amp_runtime_smoke_test.js',
 'node tests/concert_hall_contract_test.js',
 'node tests/concert_hall_worklet_sim_test.js',
 'node tests/r5_reality_contract_test.js',
 'node tests/r5_reality_worklet_sim_test.js',
 'python tests/audio_quality/generate_hall_stimulus.py',
 'python tests/audio_quality/generate_reality_stimulus.py',
 'node tests/audio_quality/run_specialized_playwright.mjs',
 'python tests/audio_quality/hall_metrics.py',
 'python tests/audio_quality/reality_metrics.py',
 'python tests/audio_quality/assert_extended_artifacts.py',
 'tests/audio_quality/results/hall-report.md',
 'tests/audio_quality/results/reality-report.md',
]
for token in required_workflow_tokens:
    require(token in wf,f'workflow wiring missing: {token}')

for rel in [
 'concert-hall.js','concert-hall-worklet.js','reality-resolution.js','reality-resolution-worklet.js',
 'stem-separator.js','stem-separator-worklet.js',
 'tests/concert_hall_contract_test.js','tests/concert_hall_worklet_sim_test.js',
 'tests/r5_reality_contract_test.js','tests/r5_reality_worklet_sim_test.js','tests/stem_amp_runtime_smoke_test.js',
 'tests/audio_quality/generate_hall_stimulus.py','tests/audio_quality/generate_reality_stimulus.py',
 'tests/audio_quality/hall_metrics.py','tests/audio_quality/reality_metrics.py',
 'tests/audio_quality/run_specialized_playwright.mjs','tests/audio_quality/specialized-runtime.js',
]:
    require((ROOT/rel).exists(),f'extended bench file missing: {rel}')

runner=text('tests/audio_quality/run_specialized_playwright.mjs')
require('runConcertHallBench' in runner and 'hall.runtime.json' in runner,'specialized runner does not capture Hall')
require('runRealityResolutionBench' in runner and 'reality.runtime.json' in runner,'specialized runner does not capture R5')
rt=text('tests/audio_quality/specialized-runtime.js')
require('runConcertHallBench' in rt and 'YurikaConcertHall' in rt,'specialized runtime Hall API missing')
require('runRealityResolutionBench' in rt and 'YurikaRealityResolution' in rt,'specialized runtime R5 API missing')

print(json.dumps({'ok':not errors,'version':meta.get('version'),'evaluator':meta.get('evaluator'),'errors':errors},ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
