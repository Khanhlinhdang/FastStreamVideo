# LiveStream Docker smoke (Windows PowerShell)
# Usage (after compose is up on :8080):
#   .\scripts\docker-smoke.ps1
#   .\scripts\docker-smoke.ps1 -BaseUrl http://127.0.0.1:8080 -WaitHlsSec 600

param(
  [string]$BaseUrl = "http://127.0.0.1:8080",
  [string]$AdminEmail = "admin@livestream.local",
  [string]$AdminPassword = "ci-admin-pass-change-me",
  [int]$WaitHlsSec = 0
)

$ErrorActionPreference = "Stop"
Write-Host "==> Smoke against $BaseUrl"

$health = Invoke-RestMethod -Uri "$BaseUrl/api/health"
if (-not $health.ok) { throw "health.ok is not true: $($health | ConvertTo-Json)" }
Write-Host "health OK"

$homePage = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing
if ($homePage.StatusCode -ne 200) { throw "GET / -> $($homePage.StatusCode)" }
Write-Host "GET / -> 200"

$apiHome = Invoke-RestMethod -Uri "$BaseUrl/api/home"
Write-Host "GET /api/home OK (hot=$($apiHome.hot.Count) latest=$($apiHome.latest.Count))"

try {
  $poster = Invoke-WebRequest -Uri "$BaseUrl/media/posters/neon-harbor.svg" -UseBasicParsing
  Write-Host "poster -> $($poster.StatusCode)"
} catch {
  Write-Host "poster optional fail: $($_.Exception.Message)"
}

$login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body (@{
  email = $AdminEmail
  password = $AdminPassword
} | ConvertTo-Json)
if (-not $login.accessToken) { throw "no accessToken" }
Write-Host "login OK"

$hdr = @{ Authorization = "Bearer $($login.accessToken)" }
$series = Invoke-RestMethod -Uri "$BaseUrl/api/admin/series" -Headers $hdr
Write-Host "admin series OK"

if ($WaitHlsSec -gt 0) {
  Write-Host "waiting up to ${WaitHlsSec}s for HLS ready..."
  $deadline = (Get-Date).AddSeconds($WaitHlsSec)
  $ready = $false
  while ((Get-Date) -lt $deadline) {
    try {
      $eps = Invoke-RestMethod -Uri "$BaseUrl/api/series/neon-harbor-chronicles/episodes"
      $items = if ($eps.items) { $eps.items } else { $eps }
      if (@($items | Where-Object { $_.statusEncode -eq "ready" }).Count -gt 0) {
        $ready = $true
        break
      }
    } catch { }
    Start-Sleep -Seconds 5
  }
  if (-not $ready) { throw "HLS not ready in time" }
  $master = Invoke-WebRequest -Uri "$BaseUrl/media/hls/1/master.m3u8" -UseBasicParsing
  if ($master.StatusCode -ne 200) { throw "master.m3u8 -> $($master.StatusCode)" }
  if ($master.Content -notmatch "EXTM3U") { throw "master.m3u8 missing EXTM3U" }
  Write-Host "HLS master OK"
}

Write-Host "OK docker smoke passed"
