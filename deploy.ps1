# ═══════════════════════════════════════════════════════════════
# VILTRUM FITNESS - AUTO DEPLOY SCRIPT
# Bumps version + injects unique build hash so SW always updates
# 
# Usage:   .\deploy.ps1                    → auto patch bump
#          .\deploy.ps1 -Bump minor        → minor bump
#          .\deploy.ps1 -Bump major        → major bump
#          .\deploy.ps1 -Message "my msg"  → custom commit message
# ═══════════════════════════════════════════════════════════════

param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",
    [string]$Message = ""
)

# ── Read current version from sw.js ──
$swPath = Join-Path $PSScriptRoot "sw.js"
$swContent = Get-Content $swPath -Raw

if ($swContent -match "const CACHE_NAME = 'viltrum-fitness-v(\d+)\.(\d+)\.(\d+)'") {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]
    $oldVersion = "v$major.$minor.$patch"
} else {
    Write-Host "ERROR: Could not find version in sw.js" -ForegroundColor Red
    exit 1
}

# ── Bump version ──
switch ($Bump) {
    "major" { $major++; $minor = 0; $patch = 0 }
    "minor" { $minor++; $patch = 0 }
    "patch" { $patch++ }
}

$newVersion = "v$major.$minor.$patch"
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$buildHash = Get-Date -Format "yyyyMMddHHmmss"

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  VILTRUM FITNESS DEPLOY" -ForegroundColor Cyan
Write-Host "  $oldVersion → $newVersion (build $buildHash)" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# ── Update sw.js ──
Write-Host "[1/5] Updating sw.js..." -ForegroundColor Green
$swContent = $swContent -replace "viltrum-fitness-v\d+\.\d+\.\d+", "viltrum-fitness-$newVersion"
$swContent = $swContent -replace "viltrum-runtime-v\d+\.\d+\.\d+", "viltrum-runtime-$newVersion"
$swContent = $swContent -replace "viltrum-preload-v\d+\.\d+\.\d+", "viltrum-preload-$newVersion"
$swContent = $swContent -replace "Installing v\d+\.\d+\.\d+", "Installing $newVersion"
$swContent = $swContent -replace "Caching app shell v\d+\.\d+\.\d+", "Caching app shell $newVersion"
$swContent = $swContent -replace "Activating v\d+\.\d+\.\d+", "Activating $newVersion"

# Inject/update build hash (guarantees byte-level change every deploy)
if ($swContent -match "const BUILD_HASH = '[^']*';") {
    $swContent = $swContent -replace "const BUILD_HASH = '[^']*';", "const BUILD_HASH = '$buildHash';"
} else {
    $swContent = $swContent -replace "(const PRELOAD_CACHE = '[^']*';)", "`$1`nconst BUILD_HASH = '$buildHash';"
}

Set-Content $swPath $swContent -NoNewline

# ── Update welcome-modal-v2.js ──
$modalPath = Join-Path (Join-Path $PSScriptRoot "js") "welcome-modal-v2.js"
if (Test-Path $modalPath) {
    Write-Host "[2/5] Updating welcome-modal-v2.js..." -ForegroundColor Green
    $modalContent = Get-Content $modalPath -Raw
    $modalContent = $modalContent -replace "const APP_VERSION = 'v[\d\.]+';", "const APP_VERSION = '$newVersion';"
    Set-Content $modalPath $modalContent -NoNewline
} else {
    Write-Host "[2/5] welcome-modal-v2.js not found, skipping" -ForegroundColor Yellow
}

# ── Git add + commit ──
Write-Host "[3/5] Git commit..." -ForegroundColor Green
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "deploy: $newVersion"
}
git add -A
git commit -m "$Message ($newVersion)"

# ── Git push ──
Write-Host "[4/5] Git push..." -ForegroundColor Green
git push -f origin main

# ── Cloudflare Worker deploy (this is what actually publishes to viltrumfitness.com) ──
# The site is a Cloudflare Worker (wrangler.jsonc). A git push alone does NOT go live —
# production only updates when `wrangler deploy` runs. Auth: a cached `wrangler login`
# (run once) or a CLOUDFLARE_API_TOKEN env var. account_id is in wrangler.jsonc.
Write-Host "[5/5] Cloudflare deploy (wrangler)..." -ForegroundColor Green
npx --yes wrangler deploy
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  wrangler deploy FAILED - site NOT updated." -ForegroundColor Red
    Write-Host "    Run 'npx wrangler login' once (opens browser), then re-run .\deploy.ps1." -ForegroundColor Yellow
    Write-Host "    Or set the CLOUDFLARE_API_TOKEN env var before running." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host "  DEPLOYED $newVersion to viltrumfitness.com" -ForegroundColor Green
Write-Host "  build: $buildHash" -ForegroundColor DarkGray
Write-Host "  $timestamp" -ForegroundColor DarkGray
Write-Host "═══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
