# Rehearse — Claude version bootstrap.
# 1) Syncs all untouched source files from ..\rehearse (never overwrites Claude files)
# 2) Applies the 2-line anchored patch to electron/main.ts
# 3) Reuses ..\rehearse\node_modules (fast robocopy) or runs npm install
# 4) Typechecks
#
# Run from anywhere:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\setup-claude.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot          # ...\rehearse-claude
$src  = Join-Path (Split-Path -Parent $root) 'rehearse'

Write-Host "== Rehearse Claude setup ==" -ForegroundColor Cyan
Write-Host "claude : $root"
Write-Host "grok   : $src"

if (-not (Test-Path (Join-Path $src 'package.json'))) {
  throw "grok original not found at $src"
}

# --- 1. sync sources (copy only files that do not exist here yet) ---
Write-Host "`n[1/4] syncing sources from grok original..." -ForegroundColor Cyan
robocopy $src $root /E /XO /XN /XC `
  /XD node_modules dist dist-electron release .git `
  /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy source sync failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0
Write-Host "  sync ok (claude files preserved)"

# --- 2. patch main.ts ---
Write-Host "`n[2/4] patching electron/main.ts..." -ForegroundColor Cyan
node (Join-Path $root 'scripts\claude-patch-main.mjs')
if ($LASTEXITCODE -ne 0) { throw "claude-patch-main.mjs failed" }

# --- 3. node_modules ---
Write-Host "`n[3/4] dependencies..." -ForegroundColor Cyan
$nmDst = Join-Path $root 'node_modules'
$nmSrc = Join-Path $src  'node_modules'
if (Test-Path (Join-Path $nmDst 'electron')) {
  Write-Host "  node_modules already present — skip"
} elseif (Test-Path $nmSrc) {
  Write-Host "  copying node_modules from grok original (fast, local)..."
  robocopy $nmSrc $nmDst /E /MT:16 /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules failed ($LASTEXITCODE)" }
  $global:LASTEXITCODE = 0
  Write-Host "  node_modules ok"
} else {
  Write-Host "  npm install..."
  Push-Location $root
  npm install
  Pop-Location
  if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

# --- 4. typecheck ---
Write-Host "`n[4/4] typecheck..." -ForegroundColor Cyan
Push-Location $root
npm run typecheck
$tc = $LASTEXITCODE
Pop-Location
if ($tc -ne 0) { throw "typecheck failed" }

Write-Host "`nAll good. Run it:" -ForegroundColor Green
Write-Host "  cd `"$root`""
Write-Host "  npm run electron:dev"
Write-Host ""
Write-Host "Mask HUD badge should read LIVE·GL (realtime GPU effects)." -ForegroundColor Green
