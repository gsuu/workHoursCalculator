param(
  [string]$NodeId = "12344",
  [string]$DownloadsDir = "$HOME\Downloads",
  [string]$WorktreePath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$RemoteUrl = "",
  [int]$Year = 0,
  [int]$Month = 0,
  [switch]$ForceRun,
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"

function Get-PreviousMonthInfo {
  $today = Get-Date
  $target = Get-Date -Year $today.Year -Month $today.Month -Day 1
  $target = $target.AddMonths(-1)

  return @{
    Year = $target.Year
    Month = $target.Month
  }
}

function Invoke-CheckedCommand {
  param(
    [string]$Command,
    [string]$Cwd
  )

  Push-Location $Cwd
  try {
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed: $Command"
    }
  }
  finally {
    Pop-Location
  }
}

function Invoke-NodeCapture {
  param(
    [string]$Code,
    [string[]]$Arguments = @(),
    [string]$Cwd
  )

  Push-Location $Cwd
  try {
    $output = & node --input-type=module -e $Code @Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "Node helper failed."
    }
    return ($output | Out-String).Trim()
  }
  finally {
    Pop-Location
  }
}

function Get-KoreanText {
  param([int[]]$CodePoints)

  -join ($CodePoints | ForEach-Object { [char]$_ })
}

function Get-TargetFile {
  param(
    [string]$Directory,
    [string]$Keyword,
    [string]$PeriodLabel,
    [datetime]$Since
  )

  Get-ChildItem -Path $Directory -File |
    Where-Object {
      $_.Name -like "*$Keyword*" -and
      $_.Name -like "*$PeriodLabel*" -and
      $_.Extension -in ".xls", ".xlsx" -and
      $_.LastWriteTime -ge $Since
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Wait-ForDownloadedFile {
  param(
    [string]$Directory,
    [string]$Keyword,
    [string]$PeriodLabel,
    [datetime]$Since,
    [int]$TimeoutSeconds = 300
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $candidate = Get-TargetFile -Directory $Directory -Keyword $Keyword -PeriodLabel $PeriodLabel -Since $Since
    if ($candidate) {
      $firstLength = $candidate.Length
      Start-Sleep -Seconds 2
      $stable = Get-TargetFile -Directory $Directory -Keyword $Keyword -PeriodLabel $PeriodLabel -Since $Since
      if ($stable -and $stable.FullName -eq $candidate.FullName -and $stable.Length -eq $firstLength) {
        return $stable.FullName
      }
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out while waiting for $Keyword"
}

function Get-RemoteUrl {
  param([string]$Path)

  $url = git -C $Path remote get-url origin
  if ($LASTEXITCODE -ne 0 -or -not $url) {
    throw "Failed to resolve origin remote URL."
  }

  return ($url | Out-String).Trim()
}

if (-not $Year -or -not $Month) {
  $previous = Get-PreviousMonthInfo
  if (-not $Year) { $Year = $previous.Year }
  if (-not $Month) { $Month = $previous.Month }
}

$yearText = [string][char]0xB144
$monthText = [string][char]0xC6D4
$attendanceKeyword = Get-KoreanText @(0xADFC, 0xD0DC, 0xD604, 0xD669)
$detailKeyword = "$(Get-KoreanText @(0xADFC, 0xBB34, 0xACB0, 0xACFC))($(Get-KoreanText @(0xC0C1, 0xC138)))"
$periodLabel = "{0}{1} {2}{3}" -f $Year, $yearText, $Month, $monthText
$attendanceUrl = "https://hr-work-api.office.hiworks.com/v4/excel/export/work-month?filter[year]=$Year&filter[month]=$Month&filter[node_id]=$NodeId&filter[type]=work"
$detailUrl = "https://hr-work-api.office.hiworks.com/v4/excel/export/work-month?filter[year]=$Year&filter[month]=$Month&filter[node_id]=$NodeId&filter[type]=detail"

$today = Get-Date
$todayKey = $today.ToString("yyyy-MM-dd")

if (-not $ForceRun -and $today.Day -gt 5) {
  Write-Host "Skip: outside the 1-5 day window ($todayKey)"
  exit 0
}

if (-not $ForceRun -and $today.DayOfWeek -in @([DayOfWeek]::Saturday, [DayOfWeek]::Sunday)) {
  Write-Host "Skip: weekend ($todayKey)"
  exit 0
}

$isHoliday = Invoke-NodeCapture -Cwd $WorktreePath -Code "import { HOLIDAY_SET } from './src/overtimeCalculator.js'; console.log(HOLIDAY_SET.has(process.argv[1]) ? 'true' : 'false');" -Arguments @($todayKey)
if (-not $ForceRun -and $isHoliday -eq "true") {
  Write-Host "Skip: holiday ($todayKey)"
  exit 0
}

$currentPeriodLabel = Invoke-NodeCapture -Cwd $WorktreePath -Code "import { PRELOADED_MONTHLY_PERIOD_LABEL } from './src/preloadedMonthlyWorkers.js'; console.log(PRELOADED_MONTHLY_PERIOD_LABEL);" 
if ($currentPeriodLabel -eq $periodLabel) {
  Write-Host "Skip: already processed $periodLabel"
  exit 0
}

Write-Host "Target period: $periodLabel"
Write-Host "Downloads dir: $DownloadsDir"
Write-Host ""
Write-Host "Opening browser download URLs. Sign in to Hiworks first if needed."

$startedAt = Get-Date
Start-Process $attendanceUrl
Start-Process $detailUrl

$attendanceFile = Wait-ForDownloadedFile -Directory $DownloadsDir -Keyword $attendanceKeyword -PeriodLabel $periodLabel -Since $startedAt
$detailFile = Wait-ForDownloadedFile -Directory $DownloadsDir -Keyword $detailKeyword -PeriodLabel $periodLabel -Since $startedAt

Write-Host ""
Write-Host "Download check complete"
Write-Host "- attendance: $attendanceFile"
Write-Host "- detail: $detailFile"

if (-not $RemoteUrl) {
  $RemoteUrl = Get-RemoteUrl -Path $WorktreePath
}

$tempRoot = Join-Path $env:TEMP ("workHoursCalculator-auto-" + [guid]::NewGuid().ToString("N"))
$tempMain = Join-Path $tempRoot "main"
$tempPages = Join-Path $tempRoot "gh-pages"

New-Item -ItemType Directory -Path $tempRoot | Out-Null

try {
  Invoke-CheckedCommand -Cwd $tempRoot -Command "git clone --branch main `"$RemoteUrl`" `"$tempMain`""
  Invoke-CheckedCommand -Cwd $tempRoot -Command "git clone --branch gh-pages `"$RemoteUrl`" `"$tempPages`""

  Invoke-CheckedCommand -Cwd $tempMain -Command "npm.cmd install"
  Invoke-CheckedCommand -Cwd $WorktreePath -Command "node scripts/generate-preloaded-monthly.mjs --attendance `"$attendanceFile`" --detail `"$detailFile`" --output `"$tempMain\src\preloadedMonthlyWorkers.js`""
  Invoke-CheckedCommand -Cwd $tempMain -Command "npm.cmd test"
  Invoke-CheckedCommand -Cwd $tempMain -Command "npm.cmd run build"

  Invoke-CheckedCommand -Cwd $tempMain -Command "git add src/preloadedMonthlyWorkers.js"
  Invoke-CheckedCommand -Cwd $tempMain -Command "git commit -m `"feat: monthly preloaded refresh`" -m `"- refresh preloaded monthly table for $periodLabel`""

  if (-not $SkipPush) {
    Invoke-CheckedCommand -Cwd $tempMain -Command "git push origin main"
  }

  if (Test-Path (Join-Path $tempPages "assets")) {
    Remove-Item -Recurse -Force (Join-Path $tempPages "assets")
  }

  Copy-Item -Recurse -Force (Join-Path $tempMain "dist\assets") (Join-Path $tempPages "assets")
  Copy-Item -Force (Join-Path $tempMain "dist\index.html") (Join-Path $tempPages "index.html")
  if (Test-Path (Join-Path $tempMain "dist\favicon.ico")) {
    Copy-Item -Force (Join-Path $tempMain "dist\favicon.ico") (Join-Path $tempPages "favicon.ico")
  }

  Invoke-CheckedCommand -Cwd $tempPages -Command "git add -A"
  Invoke-CheckedCommand -Cwd $tempPages -Command "git commit -m `"feat: monthly deploy refresh`" -m `"- deploy built assets for $periodLabel`""

  if (-not $SkipPush) {
    Invoke-CheckedCommand -Cwd $tempPages -Command "git push origin gh-pages"
  }
}
finally {
  if (Test-Path $tempRoot) {
    Remove-Item -Recurse -Force $tempRoot
  }
}

Write-Host ""
Write-Host "Done: preloaded result table and gh-pages deployment updated for $periodLabel"
