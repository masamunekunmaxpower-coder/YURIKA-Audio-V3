import json,re,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[1]
issues=[]
def req(cond,msg):
    if not cond: issues.append(msg)
manifest=json.loads((root/'manifest.json').read_text(encoding='utf-8'))
req(manifest.get('manifest_version')==3,'manifest version')
req({'storage','activeTab','tabCapture','offscreen','tabs'}.issubset(set(manifest.get('permissions',[]))),'permission drift')
req(any('youtube.com' in x for x in manifest.get('host_permissions',[])),'YouTube host permission missing')
# HTML script dependencies
for html_name in ['popup.html','offscreen.html']:
    text=(root/html_name).read_text(encoding='utf-8')
    scripts=re.findall(r'<script\s+src="([^"]+)"',text)
    for sc in scripts: req((root/sc).exists(),f'{html_name} missing script {sc}')
# service worker imports
sw=(root/'service-worker.js').read_text(encoding='utf-8')
imports=['modular-core.js','dsp-core.js','adaptive-v28.js'] if 'importScripts("modular-core.js", "dsp-core.js", "adaptive-v28.js")' in sw else []
for sc in imports: req((root/sc).exists(),f'service-worker missing import {sc}')
req(imports==['modular-core.js','dsp-core.js','adaptive-v28.js'],'unexpected service-worker import graph')
# protocol contracts
popup=(root/'popup.js').read_text(encoding='utf-8'); off=(root/'offscreen.js').read_text(encoding='utf-8')
for typ in ['GET_SETTINGS','APPLY_PATCH','APPLY_PRESET','SET_ENABLED','LIST_YOUTUBE_TABS','SET_TAB_SESSION','ARM_DECK','STOP_DECK','START_EXTERNAL','START','STOP','RESTART','UPDATE_SETTINGS','STATUS']:
    req(typ in sw,f'SW missing protocol {typ}')
for typ in ['START','ADD_SESSION','STOP_SESSION','ADD_DECK','STOP_DECK','START_EXTERNAL','STOP','UPDATE_SETTINGS','STATUS']:
    req(typ in off,f'offscreen missing protocol {typ}')
for typ in ['GET_SETTINGS','APPLY_PATCH','APPLY_PRESET','SET_ENABLED','LIST_YOUTUBE_TABS','SET_TAB_SESSION','ARM_DECK','START_EXTERNAL','STATUS']:
    req(typ in popup,f'popup missing message path {typ}')
req('chrome.storage' not in popup,'popup must not write storage directly')
req('actionQueue' in sw and 'enqueueAction' in sw,'service worker serialized action queue missing')
# settings/UI coverage
core=(root/'dsp-core.js').read_text(encoding='utf-8'); html=(root/'popup.html').read_text(encoding='utf-8')
keys=['spatialTelemetryEnabled','reflectionCharacterEnabled','reflectionCharacterAmount','reflectionCharacterMode','avSyncEnabled','avSyncDelayMs','dapMode','dapStrength','selfDapEnabled','selfDapStrength','selfDapRestoration','selfDapRestorationCutoffKhz','perspectiveEnabled','perspectiveDepth','dacMatrixMode','roomEnabled','integrityEnabled','autoLevelEnabled','djEnabled','cartridgeEnabled','sceneEnabled','sceneStrength','sceneExponent','sparkEnabled','deviceProfile','multiSpeakerEnabled']
for k in keys:
    req(k in core,f'core missing {k}'); req(f'id="{k}"' in html,f'UI missing {k}'); req(k in popup,f'popup missing {k}'); req(k in off,f'offscreen missing {k}')
# no direct network or dynamic code
for f in root.glob('*.js'):
    t=f.read_text(encoding='utf-8')
    req(not re.search(r'\beval\s*\(|\bnew\s+Function\b',t),f'dynamic code {f.name}')
    req(not re.search(r'\bfetch\s*\(|XMLHttpRequest|WebSocket',t),f'external network {f.name}')
# import graph is acyclic by construction, but verify no core imports back
req('importScripts' not in (root/'dsp-core.js').read_text(encoding='utf-8'),'core import cycle risk')
req((root/'modular-core.js').exists() and (root/'audio-modules.js').exists(),'modular files missing')
req((root/'spark-monitor-worklet.js').exists(),'spark monitor worklet missing')
req('transientValley.connect(sparkMonitor.node)' in off and 'sparkMonitor.node.connect(sceneSink)' in off,'Spark side-chain graph missing')
req('sparkMonitor.node.connect(autoLevel)' not in off,'Spark monitor entered audible serial path')

req('commitEffectiveLevelGain' in off and 'composeEffectiveLevelDb' in off,'unified gain arbiter missing')
req('computeEffectiveOutputDb(state.settings) + targets.sparkMakeupDb' not in off,'Spark still writes Output Gain')
req(off.count('smooth(gain.gain')==1,'AutoLevel Gain must have a single runtime writer')
if issues:
    print('FAIL dependency_audit',*issues,sep='\n- '); sys.exit(1)
print('PASS dependency_audit scripts + settings + message protocol + permission graph')

# v1.5 Audio Supervisor dependency assertions
text_off=(root/'offscreen.js').read_text(encoding='utf-8')
text_core=(root/'dsp-core.js').read_text(encoding='utf-8')
text_popup=(root/'popup.js').read_text(encoding='utf-8')
assert 'autoLevel.connect(adaptiveTrim)' in text_off and 'adaptiveTrim.connect(limiter)' in text_off and 'limiter.connect(safetyMeter.node)' in text_off and 'safetyMeter.node.connect(masterSafety)' in text_off
assert 'adaptiveSafetyEnabled' in text_core and 'adaptiveSafetyEnabled' in text_popup
assert (root/'safety-meter-worklet.js').exists()
print('PASS audio_supervisor_graph adaptiveTrim -> limiter -> safetyMeter -> masterSafety')
