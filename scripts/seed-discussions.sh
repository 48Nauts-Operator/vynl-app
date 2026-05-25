#!/usr/bin/env bash
# Seed the GitHub Discussions tab with four starter threads:
#   - Welcome              (Announcements category, pinned)
#   - Announcements        (Announcements category, pinned — release feed)
#   - Roadmap              (Ideas category)
#   - Show & Tell intro    (Show and tell category)
#
# Bodies come from docs/discussions/*.md. Idempotent-ish — running twice
# creates duplicates, so check the Discussions tab first if rerunning.
#
# Requirements: `gh` CLI authenticated against 48Nauts-Operator/vynl-app
# with the `discussion:write` (or repo-write) scope. GitHub Discussions
# must already be enabled on the repo (Settings → Features → Discussions).
#
# Usage: ./scripts/seed-discussions.sh
#        GH_REPO=owner/name ./scripts/seed-discussions.sh    # override repo

set -euo pipefail

REPO="${GH_REPO:-48Nauts-Operator/vynl-app}"
OWNER="${REPO%/*}"
NAME="${REPO#*/}"
scriptdir="$(cd "$(dirname "$0")" && pwd)"
discdir="$scriptdir/../docs/discussions"

echo "Seeding Discussions on $REPO..."

# Fetch repo node ID + category IDs in one query.
echo "  • fetching repo + category IDs..."
meta=$(gh api graphql -f query='
  query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      discussionCategories(first: 25) {
        nodes { id name slug }
      }
    }
  }' -F owner="$OWNER" -F name="$NAME")

repo_id=$(echo "$meta" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['repository']['id'])")
[ -z "$repo_id" ] && { echo "Couldn't read repo id — is Discussions enabled?" >&2; exit 1; }

cat_id_for() {
  echo "$meta" | python3 -c "
import json,sys
target = sys.argv[1].lower()
for c in json.load(sys.stdin)['data']['repository']['discussionCategories']['nodes']:
  if c['name'].lower() == target or c['slug'].lower() == target:
    print(c['id']); break
" "$1"
}

ann_id=$(cat_id_for "Announcements")
ideas_id=$(cat_id_for "Ideas")
showtell_id=$(cat_id_for "Show and tell")

[ -z "$ann_id"      ] && { echo "Couldn't find 'Announcements' category" >&2; exit 1; }
[ -z "$ideas_id"    ] && { echo "Couldn't find 'Ideas' category"        >&2; exit 1; }
[ -z "$showtell_id" ] && { echo "Couldn't find 'Show and tell' category">&2; exit 1; }

create_discussion() {
  local title="$1"
  local body_file="$2"
  local cat_id="$3"
  local body
  body=$(cat "$body_file")
  local resp
  resp=$(gh api graphql -f query='
    mutation($repo: ID!, $cat: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {
        repositoryId: $repo,
        categoryId:   $cat,
        title:        $title,
        body:         $body
      }) {
        discussion { url number }
      }
    }' \
    -F repo="$repo_id" -F cat="$cat_id" \
    -F title="$title" -F body="$body")
  url=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['createDiscussion']['discussion']['url'])")
  echo "    → $url"
}

echo "  • Welcome (Announcements)..."
create_discussion "👋 Welcome to Vynl" "$discdir/welcome.md" "$ann_id"

echo "  • Announcements feed (Announcements)..."
create_discussion "📣 Announcements — release notes + what's being worked on" "$discdir/announcements.md" "$ann_id"

echo "  • Roadmap (Ideas)..."
create_discussion "🗺️  Roadmap: where Vynl is going" "$discdir/roadmap.md" "$ideas_id"

echo "  • Show & Tell intro (Show and tell)..."
create_discussion "🎉 Show off your Vynl setup" "$discdir/show-and-tell.md" "$showtell_id"

echo
echo "Done. Pin the Welcome + Announcements threads manually in the UI"
echo "(GitHub doesn't expose pin via API — top-right ⋯ menu → 'Pin')."
echo
echo "Browse: https://github.com/$REPO/discussions"
