param(
  [string]$TaskName = "CTTD-Monthly-Preloaded-Deploy",
  [string]$RunAt = "11:00"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "update-preloaded-monthly.cmd"
if (-not (Test-Path $scriptPath)) {
  throw "Batch file not found: $scriptPath"
}

$startTime = [datetime]::ParseExact($RunAt, "HH:mm", $null)
$timeText = $startTime.ToString("HH:mm")
$escapedTaskPath = '"' + $scriptPath + '"'

schtasks /Create /F /TN $TaskName /TR $escapedTaskPath /SC DAILY /ST $timeText /RL LIMITED

if ($LASTEXITCODE -ne 0) {
  throw "Failed to register scheduled task."
}

Write-Host "Scheduled task registered."
Write-Host "- Name: $TaskName"
Write-Host "- Schedule: every day at $timeText (script runs only on days 1-5)"
Write-Host "- Command: $scriptPath"
