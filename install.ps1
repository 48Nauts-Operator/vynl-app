#requires -Version 5.1
<#
.SYNOPSIS
  Vynl one-click installer for Windows.

.DESCRIPTION
  Detects Docker Desktop, writes a known-good docker-compose.yml and beets
  config, pulls the Vynl image, starts the container, opens your browser.

.EXAMPLE
  iwr -useb https://raw.githubusercontent.com/48Nauts-Operator/vynl-app/main/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

function Say  { Write-Host "▸ $args" -ForegroundColor Cyan }
function Ok   { Write-Host "✓ $args" -ForegroundColor Green }
function Warn { Write-Host "⚠ $args" -ForegroundColor Yellow }
function Die  { Write-Host "✗ $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────┐"
Write-Host "  │  Vynl — self-hosted music platform      │"
Write-Host "  │  https://vynl.music                     │"
Write-Host "  └─────────────────────────────────────────┘"
Write-Host ""

# ── 1. Docker check ────────────────────────────────────────────────
Say "Checking Docker Desktop..."
try { $null = & docker --version 2>$null } catch {
  Die "Docker Desktop not found.

Install from: https://www.docker.com/products/docker-desktop/
After installing + launching Docker Desktop, re-run this script:
  iwr -useb https://raw.githubusercontent.com/48Nauts-Operator/vynl-app/main/install.ps1 | iex"
}

try { $null = & docker info 2>$null } catch {
  Die "Docker Desktop is installed but not running. Launch it from the Start menu, wait for the whale icon in the system tray to stop animating, then re-run this script."
}
Ok "Docker is running"

# ── 2. install dir + files ─────────────────────────────────────────
$InstallDir = if ($env:VYNL_INSTALL_DIR) { $env:VYNL_INSTALL_DIR } else { Join-Path $env:USERPROFILE "Music\Vynl" }
Say "Install directory: $InstallDir"
New-Item -ItemType Directory -Force -Path "$InstallDir\library", "$InstallDir\download" | Out-Null
Set-Location $InstallDir

# Use here-strings (@'...'@) so YAML indentation is preserved verbatim.
$Compose = @'
services:
  vynl:
    image: cand0rian/vynl-app:latest
    container_name: vynl
    restart: unless-stopped
    ports:
      - "3101:3101"
    volumes:
      - .:/music
      - vynl-data:/app/data
      - vynl-covers:/app/public/covers
      - vynl-artists:/app/public/artists
      - ./beets-config.yaml:/home/vynl/.config/beets/config.yaml:ro
    environment:
      - VYNL_DB_DIR=/app/data
      - BEETS_DB_PATH=/app/data/beets.db
      - NEXT_PUBLIC_VYNL_HOST=http://localhost:3101

volumes:
  vynl-data:
  vynl-covers:
  vynl-artists:
'@

$Beets = @'
directory: /music/library
library: /app/data/beets.db

paths:
    default: $albumartist/$album%aunique{}/$track $title
    singleton: Non-Album/$artist/$title
    comp: Compilations/$album%aunique{}/$track $title

import:
    move: yes
    autotag: no
    quiet: yes
    log: /app/data/beets-import.log

plugins: fetchart embedart lastgenre
'@

# -NoNewline + explicit UTF-8 (no BOM) so YAML parsers don't choke
[System.IO.File]::WriteAllText("$InstallDir\docker-compose.yml", $Compose, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText("$InstallDir\beets-config.yaml",  $Beets,   [System.Text.UTF8Encoding]::new($false))
Ok "Wrote docker-compose.yml + beets-config.yaml"

# ── 3. validate compose ────────────────────────────────────────────
& docker compose config | Out-Null
if ($LASTEXITCODE -ne 0) { Die "docker-compose validation failed" }
Ok "Compose config validated"

# ── 4. pull + start ────────────────────────────────────────────────
Say "Pulling Vynl image (~250 MB, one-time)..."
& docker compose pull

Say "Starting Vynl..."
& docker compose up -d

# ── 5. wait for HTTP 200 ───────────────────────────────────────────
Say "Waiting for Vynl to respond..."
$Url = "http://localhost:3101"
$Up = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec 2 -UseBasicParsing
    if ($r.StatusCode -eq 200) { $Up = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $Up) { Die "Vynl didn't respond after 2 minutes. Check logs:`n  cd '$InstallDir'; docker compose logs vynl" }
Ok "Vynl is up at $Url"

$version = & docker exec vynl node -p 'require("/app/package.json").version' 2>$null
if ($version) { Ok "Vynl version: $version" }

# ── 6. open browser ────────────────────────────────────────────────
Start-Process $Url

Write-Host ""
Write-Host "Vynl is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Open:       $Url"
Write-Host "  Library:    $InstallDir\library"
Write-Host "  Downloads:  $InstallDir\download"
Write-Host "  Config:     $InstallDir\docker-compose.yml"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Drop music into $InstallDir\library"
Write-Host "  2. Settings → Library → Scan Library"
Write-Host "  3. (Optional) Settings → API Keys"
Write-Host ""
Write-Host "Upgrade later:"
Write-Host "  cd '$InstallDir'; docker compose pull; docker compose up -d"
Write-Host ""
