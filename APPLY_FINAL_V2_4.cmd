@echo off
setlocal
set "REPO=%~1"
if "%REPO%"=="" (
 echo YURIKA-Audio-V3 folder をこのファイルの上へドラッグ＆ドロップしてください。
 pause
 exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply_final_v2_4.ps1" -RepoPath "%REPO%"
