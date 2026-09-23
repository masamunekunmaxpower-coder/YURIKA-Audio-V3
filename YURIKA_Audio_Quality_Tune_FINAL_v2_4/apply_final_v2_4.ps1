param([Parameter(Mandatory=$true)][string]$RepoPath)
$ErrorActionPreference = "Stop"
function Fail([string]$m){ Write-Host ""; Write-Host "[ERROR] $m" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
$RepoPath=[System.IO.Path]::GetFullPath($RepoPath)
if(!(Test-Path (Join-Path $RepoPath 'manifest.json'))){Fail 'manifest.json が見つかりません。YURIKA-Audio-V3のルートフォルダを指定してください。'}
$Patch=Join-Path $PSScriptRoot 'repo_patch'
if(!(Test-Path $Patch)){Fail 'repo_patch が見つかりません。ZIPを展開してから実行してください。'}
$Files=@(
'dsp-core.js','offscreen.js','audio-modules.js','self-dap-core.js',
'tests\audio_modules_test.js','tests\audio_quality\final_tuning_model.py','tests\audio_quality\selfdap_response_test.py',
'tests\dsp_logic_test.js','tests\final_audio_contract_test.js','tests\runtime_mock_test.js',
'tests\self_dap_monitor_contract_test.js','tests\self_dap_runtime_v22_test.js','tests\self_dap_system_test.js','tests\static_test.py'
)
$Stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$Backup=Join-Path $env:TEMP ('YURIKA_FINAL_v2_4_Backup_'+$Stamp)
New-Item -ItemType Directory -Force -Path $Backup | Out-Null
$Existing=@{}
foreach($Rel in $Files){
  $Src=Join-Path $Patch $Rel; if(!(Test-Path $Src)){Fail "Patch file missing: $Rel"}
  $Dst=Join-Path $RepoPath $Rel; $DstDir=Split-Path $Dst -Parent; New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
  $Existing[$Rel]=Test-Path $Dst
  if($Existing[$Rel]){ $Bak=Join-Path $Backup $Rel; New-Item -ItemType Directory -Force -Path (Split-Path $Bak -Parent) | Out-Null; Copy-Item $Dst $Bak -Force }
  Copy-Item $Src $Dst -Force; Write-Host "[COPY] $Rel"
}
$Marker=Join-Path $env:TEMP 'YURIKA_FINAL_v2_4_last_backup.json'
@{repo=$RepoPath;backup=$Backup;files=$Files;existing=$Existing}|ConvertTo-Json -Depth 8|Set-Content -Encoding UTF8 $Marker
$Node=Get-Command node -ErrorAction SilentlyContinue
if($Node){ foreach($Rel in @('dsp-core.js','offscreen.js','audio-modules.js','self-dap-core.js','tests\final_audio_contract_test.js')){ & node --check (Join-Path $RepoPath $Rel); if($LASTEXITCODE -ne 0){Fail "node --check failed: $Rel"} }; Write-Host '[OK] JavaScript syntax check passed.' -ForegroundColor Green }
Write-Host ''; Write-Host '[OK] FINAL v2.4 applied.' -ForegroundColor Green
Write-Host "Backup: $Backup"
Write-Host 'Commit summary: Final audio debug and tuning v2.4'
Read-Host 'Press Enter to close'
