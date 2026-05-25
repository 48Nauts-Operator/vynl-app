#!/usr/bin/env bash
# Create the four "DJ pipeline" vision issues. By default targets GitHub
# (where the public lives); switch to Forgejo with TARGET=forgejo for
# internal dev tracking.
#
# Usage:
#   ./scripts/create-vision-issues.sh                        # GitHub (default)
#   TARGET=forgejo FORGEJO_TOKEN=<pat> ./scripts/...         # Forgejo internal
#
# GitHub path uses the `gh` CLI (must be authenticated already).
# Forgejo path uses curl + FORGEJO_TOKEN env var.

set -euo pipefail

TARGET="${TARGET:-github}"
scriptdir="$(cd "$(dirname "$0")" && pwd)"
issuesdir="$scriptdir/../docs/issues"

declare -a ISSUES=(
  "feat: Vynl YouTube downloader UI (yt-dlp wrapper)|0001-youtube-downloader.md"
  "feat: YouTube → tracklist → auto-download (DJ set decomposer)|0002-dj-set-decomposer.md"
  "feat: AI DJ — learn from decomposed reference sets|0003-ai-dj-corpus-learning.md"
  "feat: DJ Trainer — 'Name That Track' game on your library|0004-dj-trainer-game.md"
)

if [ "$TARGET" = "github" ]; then
  REPO="${GH_REPO:-48Nauts-Operator/vynl-app}"
  echo "Creating issues on GitHub: $REPO"
  for entry in "${ISSUES[@]}"; do
    title="${entry%%|*}"
    file="${entry##*|}"
    echo "  • $title"
    gh issue create --repo "$REPO" \
      --title "$title" \
      --body-file "$issuesdir/$file" \
      --label "enhancement"
  done
  echo
  echo "Browse: https://github.com/$REPO/issues"

elif [ "$TARGET" = "forgejo" ]; then
  : "${FORGEJO_TOKEN:?Set FORGEJO_TOKEN (Forgejo personal access token)}"
  HOST="${FORGEJO_HOST:-http://cosmos.tail138398.ts.net:3000}"
  OWNER="${FORGEJO_OWNER:-48Nauts}"
  REPO="${FORGEJO_REPO:-vynl}"
  API="$HOST/api/v1/repos/$OWNER/$REPO/issues"
  echo "Creating issues on Forgejo: $OWNER/$REPO ($HOST)"
  for entry in "${ISSUES[@]}"; do
    title="${entry%%|*}"
    file="${entry##*|}"
    body_json=$(python3 -c "import json,sys; print(json.dumps(open(sys.argv[1]).read()))" "$issuesdir/$file")
    title_json=$(python3 -c "import json,sys; print(json.dumps(sys.argv[1]))" "$title")
    payload="{\"title\": $title_json, \"body\": $body_json, \"labels\": [\"enhancement\"]}"
    resp=$(curl -sS -X POST -H "Authorization: token $FORGEJO_TOKEN" \
                -H "Content-Type: application/json" \
                -d "$payload" "$API")
    num=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('number','?'))")
    url=$(echo "$resp" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('html_url','?'))")
    echo "  • $title → #$num  $url"
  done
  echo
  echo "Browse: $HOST/$OWNER/$REPO/issues"

else
  echo "Unknown TARGET=$TARGET (use 'github' or 'forgejo')" >&2
  exit 1
fi
