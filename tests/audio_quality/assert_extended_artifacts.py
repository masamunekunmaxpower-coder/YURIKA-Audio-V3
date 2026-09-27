from pathlib import Path
import json, sys
HERE=Path(__file__).resolve().parent
RESULTS=HERE/'results'
required=[
 'hall.pre.wav','hall.post.wav','hall.final.wav','hall.status.json','hall.runtime.json','hall-report.json','hall-report.md',
 'reality.pre.wav','reality.post.wav','reality.final.wav','reality.status.json','reality.runtime.json','reality-report.json','reality-report.md',
]
missing=[x for x in required if not (RESULTS/x).exists()]
empty=[x for x in required if (RESULTS/x).exists() and (RESULTS/x).stat().st_size==0]
print(json.dumps({'ok':not missing and not empty,'missing':missing,'empty':empty},indent=2))
sys.exit(1 if missing or empty else 0)
