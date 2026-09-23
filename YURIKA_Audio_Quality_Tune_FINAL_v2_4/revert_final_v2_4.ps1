$ErrorActionPreference='Stop'
$Marker=Join-Path $env:TEMP 'YURIKA_FINAL_v2_4_last_backup.json'
if(!(Test-Path $Marker)){Write-Host '[ERROR] Backup marker not found.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1}
$I=Get-Content $Marker -Raw | ConvertFrom-Json
foreach($Rel in $I.files){
 $Dst=Join-Path ([string]$I.repo) $Rel; $Bak=Join-Path ([string]$I.backup) $Rel
 $was=[bool]$I.existing.$Rel
 if($was -and (Test-Path $Bak)){New-Item -ItemType Directory -Force -Path (Split-Path $Dst -Parent)|Out-Null;Copy-Item $Bak $Dst -Force;Write-Host "[RESTORE] $Rel"}
 elseif(!$was -and (Test-Path $Dst)){Remove-Item $Dst -Force;Write-Host "[REMOVE] $Rel"}
}
Write-Host '[OK] FINAL v2.4 reverted.' -ForegroundColor Green
Read-Host 'Press Enter to close'
