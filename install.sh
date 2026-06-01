#!/usr/bin/env bash
#
# Vynl one-click installer for Linux + macOS.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/48Nauts-Operator/vynl-app/main/install.sh | bash
#
# Or download + run manually:
#   curl -fsSLO https://raw.githubusercontent.com/48Nauts-Operator/vynl-app/main/install.sh
#   bash install.sh
#
# What it does:
#   1. Detects your OS (Linux or macOS) — exits clearly on anything else
#   2. Checks Docker. On Linux: auto-installs via get.docker.com if missing.
#      On macOS: prints a Docker Desktop link if missing.
#   3. Writes a known-good docker-compose.yml and beets config to
#      ~/Music/Vynl (overridable via VYNL_INSTALL_DIR env var)
#   4. Pulls the Vynl image, starts the container, waits for healthcheck
#   5. Opens your browser to http://localhost:3101 on success
#
# Idempotent: re-running upgrades Vynl to the latest image without
# touching your library or DB.

set -euo pipefail

# Some execution contexts (Docker exec, CI runners, NAS task schedulers)
# don't set HOME. Fall back to the running user's actual home from /etc/passwd
# or /root for uid 0.
if [[ -z "${HOME:-}" ]]; then
  if [[ "$(id -u)" == "0" ]]; then
    export HOME=/root
  else
    export HOME=$(getent passwd "$(id -un)" | cut -d: -f6)
    [[ -z "$HOME" ]] && export HOME="/tmp"
  fi
fi

# ── colors (ANSI-C $'…' makes these real escape bytes, so they work
#    inside plain `cat <<HEREDOC` blocks too — not just printf) ──────
C_RESET=$'\033[0m'
C_BOLD=$'\033[1m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'
C_CYAN=$'\033[36m'

say()  { printf "${C_CYAN}▸${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_GREEN}✓${C_RESET} %s\n" "$*"; }
warn() { printf "${C_YELLOW}⚠${C_RESET} %s\n" "$*"; }
die()  { printf "${C_RED}✗${C_RESET} %s\n" "$*" >&2; exit 1; }

cat <<'BANNER'

  ┌─────────────────────────────────────────┐
  │  Vynl — self-hosted music platform      │
  │  https://vynl.music                     │
  └─────────────────────────────────────────┘

BANNER

# ── 1. detect OS + platform flavor ───────────────────────────────────
OS=""
case "$(uname -s)" in
  Linux*)   OS=linux ;;
  Darwin*)  OS=macos ;;
  *)        die "Unsupported OS: $(uname -s). Vynl supports Linux + macOS via this script. For Windows, use install.ps1." ;;
esac
ARCH="$(uname -m)"

# Detect NAS flavor — these have known directory conventions, native
# host networking that works for Sonos, and usually a pre-existing music
# share that we should mount instead of creating a new one.
PLATFORM="generic-$OS"
DEFAULT_INSTALL_DIR="$HOME/Music/Vynl"
USE_HOST_NETWORK="no"
if [[ "$OS" == "linux" ]]; then
  if [[ -d /volume1 ]]; then
    # Synology DSM 7 + UGREEN UGOS Pro both use /volume1
    PLATFORM="nas-volume1"
    DEFAULT_INSTALL_DIR="/volume1/Vynl"
    USE_HOST_NETWORK="yes"
  elif [[ -d /share/CACHEDEV1_DATA ]]; then
    # QNAP QTS
    PLATFORM="nas-qnap"
    DEFAULT_INSTALL_DIR="/share/CACHEDEV1_DATA/Vynl"
    USE_HOST_NETWORK="yes"
  elif [[ -f /etc/rpi-issue ]] || grep -qi "raspbian\|raspberry" /etc/os-release 2>/dev/null; then
    PLATFORM="raspberry-pi"
    DEFAULT_INSTALL_DIR="$HOME/vynl"
    USE_HOST_NETWORK="yes"
  fi
fi

say "Platform: $PLATFORM ($OS/$ARCH)"
[[ "$USE_HOST_NETWORK" == "yes" ]] && say "Using host networking (Sonos discovery enabled)"

# ── 2. check Docker ──────────────────────────────────────────────────
# Vynl deliberately does NOT install Docker for you. Docker is the
# platform — your OS or your NAS already has a preferred way to install
# it (apt, App Center, Docker Desktop, etc.). Touching system packages
# from this script creates ongoing OS-update fragility. Vynl runs
# entirely inside containers + named volumes; once Docker is present,
# nothing else on your system is touched.
#
# So: detect, point at the right install path for this OS, exit clean.
if ! command -v docker >/dev/null 2>&1; then
  case "$OS" in
    macos)
      die "Docker Desktop is not installed.

  1. Download from: https://www.docker.com/products/docker-desktop/
  2. Open the .dmg, drag Docker to Applications, launch it
  3. Wait for the whale icon in the menu bar to be steady
  4. Re-run this script"
      ;;
    linux)
      # Detect distro family so we can give the right command, not a generic shrug
      DISTRO_HINT=""
      if [[ -f /etc/rpi-issue ]] || grep -qi "raspberry" /etc/os-release 2>/dev/null; then
        DISTRO_HINT="  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker \$USER  &&  newgrp docker"
      elif [[ -f /etc/debian_version ]]; then
        DISTRO_HINT="  sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin
  sudo usermod -aG docker \$USER  &&  newgrp docker"
      elif [[ -f /etc/redhat-release ]]; then
        DISTRO_HINT="  sudo dnf install -y docker docker-compose
  sudo systemctl enable --now docker
  sudo usermod -aG docker \$USER  &&  newgrp docker"
      else
        DISTRO_HINT="  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker \$USER  &&  newgrp docker"
      fi
      die "Docker is not installed.

Install it with:
$DISTRO_HINT

Then re-run this script."
      ;;
  esac
fi

# Docker is installed — confirm the daemon is reachable. We don't try to
# start it for you; on macOS that's Docker Desktop's job, on Linux it's
# the init system's. Just tell you clearly what to do.
if ! docker info >/dev/null 2>&1; then
  case "$OS" in
    macos)
      die "Docker Desktop is installed but not running. Launch it (Spotlight → Docker), wait for the whale icon in the menu bar to be steady, then re-run this script."
      ;;
    linux)
      RUN_USER="${USER:-$(id -un)}"
      # Group-perm issue is the most common silent failure
      if [[ "$(id -u)" != "0" ]] && ! groups "$RUN_USER" 2>/dev/null | grep -q '\bdocker\b'; then
        die "Your user '$RUN_USER' isn't in the docker group, so Docker won't talk to you.
  sudo usermod -aG docker $RUN_USER  &&  newgrp docker
Then re-run this script."
      fi
      die "Docker daemon isn't running. Start it:
  sudo systemctl start docker     (systemd-based distros)
  sudo service docker start       (sysv-init / NAS firmware)
Then re-run this script."
      ;;
  esac
fi
ok "Docker is running"

# Compose v2 ('docker compose') or legacy v1 ('docker-compose')
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "Docker Compose not found. Modern Docker installs include it as 'docker compose'. Reinstall Docker."
fi
ok "Compose: ${COMPOSE[*]}"

# ── 3. install dir + files ───────────────────────────────────────────
INSTALL_DIR="${VYNL_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
say "Install directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/library" "$INSTALL_DIR/download"
cd "$INSTALL_DIR"

# Build the network stanza per platform.
# NAS + Pi (real Linux hosts): network_mode: host — works correctly and
#   gives Sonos discovery via SSDP multicast.
# macOS Docker Desktop + bare Linux desktop: ports: 3101:3101 — host
#   networking on Docker Desktop is unreliable; ports: works everywhere.
if [[ "$USE_HOST_NETWORK" == "yes" ]]; then
  NET_STANZA='    network_mode: host'
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)
  VYNL_HOST_URL="http://${LAN_IP}:3101"
else
  NET_STANZA='    ports:
      - "3101:3101"'
  VYNL_HOST_URL="http://localhost:3101"
fi

cat > docker-compose.yml <<COMPOSE
services:
  vynl:
    image: cand0rian/vynl-app:latest
    container_name: vynl
    restart: unless-stopped
${NET_STANZA}
    volumes:
      - .:/music
      - vynl-data:/app/data
      - vynl-covers:/app/public/covers
      - vynl-artists:/app/public/artists
      - ./beets-config.yaml:/home/vynl/.config/beets/config.yaml:ro
    environment:
      - VYNL_DB_DIR=/app/data
      - BEETS_DB_PATH=/app/data/beets.db
      - NEXT_PUBLIC_VYNL_HOST=${VYNL_HOST_URL}

volumes:
  vynl-data:
  vynl-covers:
  vynl-artists:
COMPOSE

# beets-config.yaml — directory: must be writable inside the container
cat > beets-config.yaml <<'BEETS'
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
BEETS

ok "Wrote docker-compose.yml + beets-config.yaml"

# Validate before pulling — catches yaml mistakes cheaply
if ! "${COMPOSE[@]}" config >/dev/null 2>&1; then
  "${COMPOSE[@]}" config  # re-run to print the error
  die "docker-compose validation failed (see above)"
fi
ok "Compose config validated"

# ── 4. pull + start ──────────────────────────────────────────────────
say "Pulling Vynl image (~250 MB, one-time)..."
"${COMPOSE[@]}" pull

say "Starting Vynl..."
"${COMPOSE[@]}" up -d

# ── 5. wait for HTTP 200 ─────────────────────────────────────────────
say "Waiting for Vynl to respond..."
URL="http://localhost:3101"
for i in $(seq 1 60); do
  if curl -fsS -m 2 -o /dev/null "$URL"; then
    ok "Vynl is up at $URL"
    break
  fi
  if [[ $i -eq 60 ]]; then
    die "Vynl didn't respond after 2 minutes. Check logs:
  cd $INSTALL_DIR && ${COMPOSE[*]} logs vynl"
  fi
  sleep 2
done

# ── 6. version + open browser ────────────────────────────────────────
VERSION=$(docker exec vynl node -p 'require("/app/package.json").version' 2>/dev/null || echo "unknown")
ok "Vynl version: $VERSION"

if [[ "$OS" == "macos" ]]; then
  open "$URL" 2>/dev/null || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
fi

cat <<DONE

${C_BOLD}${C_GREEN}Vynl is running!${C_RESET}

  Open:        $URL
  Library:     $INSTALL_DIR/library
  Downloads:   $INSTALL_DIR/download
  Config:      $INSTALL_DIR/docker-compose.yml

${C_BOLD}Next steps:${C_RESET}
  1. Drop music files into $INSTALL_DIR/library
  2. In Vynl, go to Settings → Library → Scan Library
  3. (Optional) Settings → API Keys to enable AI features

${C_BOLD}Useful commands:${C_RESET}
  ${COMPOSE[*]} -f $INSTALL_DIR/docker-compose.yml logs -f
  ${COMPOSE[*]} -f $INSTALL_DIR/docker-compose.yml restart
  ${COMPOSE[*]} -f $INSTALL_DIR/docker-compose.yml pull && ${COMPOSE[*]} -f $INSTALL_DIR/docker-compose.yml up -d   # upgrade

DONE
