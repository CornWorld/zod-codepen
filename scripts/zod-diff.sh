#!/bin/bash
#
# zod-diff.sh — Detect Zod upstream changes and sync into zod-codepen.
#
# Usage:
#   ./scripts/zod-diff.sh detect --from 3.22.0 --to 3.23.0
#   ./scripts/zod-diff.sh plan --delta delta.json
#   ./scripts/zod-diff.sh generate --plan sync-plan.json
#   ./scripts/zod-diff.sh verify --patch path/to.patch
#   ./scripts/zod-diff.sh prompt --delta delta.json
#
# All commands delegate to the zod-sync Go tool in pkgs/go/cmd/zod-sync/.
# If no arguments are given, fetches the latest Zod release info from GitHub.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
GO_TOOL_DIR="$PROJECT_ROOT/pkgs/go/cmd/zod-sync"

# Build once, place into dist/
BINARY="$PROJECT_ROOT/dist/zod-sync"

build_tool() {
    if [ ! -x "$BINARY" ] || [ "$BINARY" -ot "$GO_TOOL_DIR/main.go" ]; then
        echo "🔧 Building zod-sync..." >&2
        (cd "$GO_TOOL_DIR" && go build -o "$BINARY" .) >&2
        echo "✅ zod-sync built" >&2
    fi
}

# Auto-detect: fetch the latest Zod release and show the diff
auto_detect() {
    echo "🔍 Fetching latest Zod release info from GitHub..." >&2
    
    # Get the current baseline from capabilities.yaml
    CAPS_FILE="$PROJECT_ROOT/.snow/sync/capabilities.yaml"
    if [ -f "$CAPS_FILE" ]; then
        CURRENT_V3=$(grep 'v3:' "$CAPS_FILE" | head -1 | awk '{print $2}' | tr -d '"')
        echo "   Current baseline: Zod v3 = $CURRENT_V3" >&2
    fi
    
    # Fetch recent Zod releases
    echo ""
    echo "📦 Recent Zod releases (via GitHub API):" >&2
    curl -s "https://api.github.com/repos/colinhacks/zod/releases?per_page=5" \
        | jq -r '.[] | "  \(.tag_name) — \(.published_at | sub("T"; " ") | .[0:10])"' 2>/dev/null \
        || echo "  (GitHub API not available, install jq for pretty output)" >&2
    
    echo ""
    echo "💡 To detect specific changes between versions, run:" >&2
    echo "   $0 detect --from <current> --to <target>" >&2
    echo ""
    echo "   Then pipe the output through:" >&2
    echo "   $0 plan --delta delta.json" >&2
}

case "${1:-auto}" in
    detect|plan|generate|verify|prompt)
        build_tool
        exec "$BINARY" "$@"
        ;;
    auto|--help|-h)
        auto_detect
        ;;
    *)
        echo "Unknown command: $1" >&2
        echo "Usage: $0 {detect|plan|generate|verify|prompt}" >&2
        exit 1
        ;;
esac
