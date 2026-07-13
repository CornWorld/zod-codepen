#!/bin/bash
# try-sync.sh — Quick local test of the zod-sync workflow with OpenCode Zen DS Flash.
#
# Usage:
#   ZEN_API_KEY=sk-xxxx ./scripts/try-sync.sh --from 3.23.0 --to 3.24.0
#
# This simulates the full Phase 0→4 workflow locally:
#   1. Fetch Zod changelog from GitHub
#   2. Call OpenCode Zen DS Flash to fill delta.json
#   3. Run zod-sync plan (rule-based)
#   4. Run zod-sync generate (template fill)
#   5. Show the generated patches
#
# Environment:
#   ZEN_API_KEY     OpenCode Zen API key (get from https://opencode.ai/zen)
#                    If not set: skip AI step and create empty delta

set -euo pipefail

FROM=""
TO=""
ZEN_API_KEY="${ZEN_API_KEY:-}"

usage() {
    cat <<EOF
Usage: $0 --from <ver> --to <ver>

Quick test of the zod-sync workflow using OpenCode Zen DeepSeek V4 Flash Free.

Environment:
  ZEN_API_KEY    OpenCode Zen API key (optional; skips AI fill if not set)

Example:
  # Get your free API key at https://opencode.ai/zen
  export ZEN_API_KEY=sk-xxxx
  ./scripts/try-sync.sh --from 3.23.0 --to 3.24.0
EOF
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --from) FROM="$2"; shift 2 ;;
        --to) TO="$2"; shift 2 ;;
        --help|-h) usage ;;
        *) echo "Unknown: $1"; usage ;;
    esac
done

if [[ -z "$FROM" || -z "$TO" ]]; then
    echo "Error: --from and --to required"
    usage
fi

WORKDIR="$(mktemp -d)"
trap "rm -rf $WORKDIR" EXIT

echo "============================================"
echo "  zod-sync trial: $FROM → $TO"
echo "  Working dir: $WORKDIR"
echo "============================================"
echo ""

# ------------------------------------------------------------------
# Step 1: Fetch Zod changelog
# ------------------------------------------------------------------
echo "📥 Step 1: Fetching Zod $TO release notes..."
RELEASE_JSON=$(curl -sf "https://api.github.com/repos/colinhacks/zod/releases/tags/v$TO" 2>/dev/null || echo '')

if [[ -n "$RELEASE_JSON" ]]; then
    echo "$RELEASE_JSON" | jq -r '.body' > "$WORKDIR/changelog.md"
    echo "   ✅ Got release notes ($(wc -c < "$WORKDIR/changelog.md" | tr -d ' ') bytes)"
else
    echo "   ⚠️  Could not find release v$TO. Trying releases list..."
    RELEASES=$(curl -sf "https://api.github.com/repos/colinhacks/zod/releases?per_page=10" 2>/dev/null || echo '[]')
    echo "$RELEASES" | jq -r '.[] | select(.tag_name == "v'$TO'") | .body' > "$WORKDIR/changelog.md"
    if [[ -s "$WORKDIR/changelog.md" ]]; then
        echo "   ✅ Found in releases list"
    else
        echo "   ⚠️  Could not find changelog for v$TO"
        echo "   Creating empty delta..."
        echo "{\"from\":\"$FROM\",\"to\":\"$TO\",\"changes\":[]}" > "$WORKDIR/delta.json"
    fi
fi

# ------------------------------------------------------------------
# Step 2: AI fills delta.json
# ------------------------------------------------------------------
if [[ -n "$ZEN_API_KEY" && -s "$WORKDIR/changelog.md" ]]; then
    echo ""
    echo "🤖 Step 2: Calling DeepSeek V4 Flash to parse changelog..."
    bash ./scripts/zod-delta-fill.sh \
        --from "$FROM" --to "$TO" \
        --changelog "$WORKDIR/changelog.md" \
        --output "$WORKDIR/delta.json" 2>&1 | sed 's/^/   /'
elif [[ ! -f "$WORKDIR/delta.json" ]]; then
    echo "   ⚠️  No ZEN_API_KEY and no changelog. Creating empty delta."
    echo "{\"from\":\"$FROM\",\"to\":\"$TO\",\"changes\":[]}" > "$WORKDIR/delta.json"
else
    echo "   ℹ️  ZEN_API_KEY not set. Skipping AI fill."
fi

# ------------------------------------------------------------------
# Step 3: Show delta
# ------------------------------------------------------------------
echo ""
echo "📊 Step 3: Delta summary:"
jq '{from, to, change_count: (.changes | length)}' "$WORKDIR/delta.json"
jq -r '.changes[] | "   - [\(.type)] \(.name) on \(.primitive // "n/a"): \(.source // "no description")"' "$WORKDIR/delta.json" 2>/dev/null || true

# ------------------------------------------------------------------
# Step 4: Generate sync plan
# ------------------------------------------------------------------
echo ""
echo "📋 Step 4: Generating sync plan..."
cd pkgs/go
go run ./cmd/zod-sync/ plan --delta "$WORKDIR/delta.json" > "$WORKDIR/sync-plan.json" 2>/dev/null
cd ../..
echo "   Actions: $(jq '.actions | length' "$WORKDIR/sync-plan.json")"

# ------------------------------------------------------------------
# Step 5: Generate patches
# ------------------------------------------------------------------
mkdir -p "$WORKDIR/patches"
echo ""
echo "📝 Step 5: Generating patches..."
cd pkgs/go
go run ./cmd/zod-sync/ generate --plan "$WORKDIR/sync-plan.json" --out "$WORKDIR/patches" 2>/dev/null
cd ../..

# ------------------------------------------------------------------
# Step 6: Show patches
# ------------------------------------------------------------------
echo ""
echo "📄 Step 6: Generated patches:"
for patch in "$WORKDIR"/patches/zod-*.patch; do
    if [[ -f "$patch" ]]; then
        echo "   --- $(basename "$patch") ---"
        cat "$patch" | sed 's/^/   /'
        echo ""
    fi
done

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
echo "============================================"
echo "  Done! Files at: $WORKDIR"
echo "  delta.json       → structured change list"
echo "  sync-plan.json   → actions to perform"
echo "  patches/         → code patches to apply"
echo "============================================"
echo ""
echo "To apply patches:"
echo "  git apply $WORKDIR/patches/zod-*.patch"
echo "  cd pkgs/go && go build ./... && go test ./..."
