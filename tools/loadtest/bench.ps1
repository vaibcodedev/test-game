# Замер нагрузки WorldRoom: под замком tools/out/scenario.lock поднимает сервер (BelowNormal, TEST_MODE, своя БД, пробник такта),
# гоняет tools/loadtest/world.ts на каждое число ботов и кладёт JSON в tools/out/loadtest/.
#   powershell -File tools/loadtest/bench.ps1 -Clients "10,30" -Duration 60 -Port 2599 [-Spread]
param([string]$Clients = "10,30", [int]$Duration = 60, [int]$Port = 2599, [switch]$Spread)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot\..\.."
$out = Join-Path $root 'tools\out\loadtest'
$lock = Join-Path $root 'tools\out\scenario.lock'
New-Item -ItemType Directory -Force $out | Out-Null
$counts = @($Clients -split '[, ]+' | Where-Object { $_ } | ForEach-Object { [int]$_ })
foreach ($n in $counts) { if ($n -gt 30) { throw "не больше 30 ботов (слабая машина)" } }

# замок — каталог: mkdir атомарен; чужой не трогаем, ждём до 30 мин
$t0 = Get-Date
while ($true) {
  try { New-Item -ItemType Directory $lock -ErrorAction Stop | Out-Null; break } catch {
    if (((Get-Date) - $t0).TotalMinutes -gt 30) { throw "замок занят более 30 мин" }
    Start-Sleep -Seconds 5
  }
}
Set-Content -Path (Join-Path $lock 'owner.txt') -Value "loadtest bench pid=$PID $(Get-Date -Format s)" -Encoding utf8
$server = $null
try {
  foreach ($n in $counts) {
    $db = Join-Path $out "lt-$n.sqlite"
    Remove-Item "$db*" -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $out "lt-$n-war.json") -Force -ErrorAction SilentlyContinue
    $probe = Join-Path $out "probe-$n.jsonl"
    $env:PORT = "$Port"; $env:DB_PATH = $db; $env:TEST_MODE = '1'; $env:LOADTEST_PROBE_OUT = $probe
    $server = Start-Process -FilePath 'node' -ArgumentList '--import', 'tsx', '--import', './tools/loadtest/probe.ts', 'server/src/index.ts' `
      -WorkingDirectory $root -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $out "server-$n.log") -RedirectStandardError (Join-Path $out "server-$n.err.log")
    $server.PriorityClass = 'BelowNormal'
    $ok = $false
    for ($i = 0; $i -lt 200 -and -not $server.HasExited; $i++) {
      try { Invoke-WebRequest -UseBasicParsing "http://localhost:$Port/health" -TimeoutSec 2 | Out-Null; $ok = $true; break } catch { Start-Sleep -Milliseconds 300 }
    }
    if (-not $ok) { throw "сервер не поднялся на $Port (см. server-$n.err.log)" }
    Start-Sleep -Seconds 5  # базовый фон без ботов
    $botArgs = @('--import', 'tsx', 'tools/loadtest/world.ts', '--clients', "$n", '--duration', "$Duration", '--port', "$Port", '--out', (Join-Path $out "run-$n.json"))
    if ($Spread) { $botArgs += '--spread' }
    $bots = Start-Process -FilePath 'node' -ArgumentList $botArgs -WorkingDirectory $root -PassThru -NoNewWindow `
      -RedirectStandardOutput (Join-Path $out "bots-$n.log") -RedirectStandardError (Join-Path $out "bots-$n.err.log")
    try { $bots.PriorityClass = 'BelowNormal' } catch {}
    $bots.WaitForExit()
    Start-Sleep -Seconds 2
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    $server.WaitForExit(5000) | Out-Null
    $server = $null
    Write-Host "готово: $n ботов"
  }
} finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item $lock -Recurse -Force -ErrorAction SilentlyContinue
}
