#!/bin/bash
# zod-delta-fill.sh — Call OpenCode Zen DeepSeek V4 Flash Free (no key needed!)
# to parse a Zod changelog into structured delta.json.
#
# Usage:
#   ./zod-delta-fill.sh \
#     --from 3.22.0 --to 3.23.0 \
#     --changelog ./zod-changelog.md \
#     --output delta.json
#
# Environment (all optional):
#   ZEN_BASE_URL       API base URL (default: https://opencode.ai/zen/v1)
#   ZEN_MODEL          Model ID (default: deepseek-v4-flash-free)
#   ZEN_API_KEY        API key (default: none — free model doesn't need one)
#
# Prerequisites: curl, jq

set -euo pipefail

FROM=""
TO=""
CHANGELOG=""
OUTPUT="delta.json"
ZEN_API_KEY="${ZEN_API_KEY:-}"
ZEN_BASE_URL="${ZEN_BASE_URL:-https://opencode.ai/zen/v1}"
ZEN_MODEL="${ZEN_MODEL:-deepseek-v4-flash-free}"

usage() {
    cat <<EOF
Usage: $0 --from <ver> --to <ver> --changelog <file> [--output <file>]

Options:
  --from <ver>       Source Zod version (e.g., 3.22.0)
  --to <ver>         Target Zod version (e.g., 3.23.0)
  --changelog <file> Path to Zod changelog markdown file
  --output <file>    Output delta.json path (default: delta.json)

Environment:
  ZEN_API_KEY        OpenCode Zen API key (required)
  ZEN_BASE_URL       API base URL (default: https://opencode.ai/zen/v1)
  ZEN_MODEL          Model ID (default: deepseek-v4-flash-free)

Example:
  # 1. Get the changelog
  curl -s https://api.github.com/repos/colinhacks/zod/releases \\
    | jq -r '.[0].body' > zod-changelog.md

  # 2. Parse it into structured delta
  ZEN_API_KEY=sk-xxxx ./zod-delta-fill.sh \\
    --from 3.22.0 --to 3.23.0 \\
    --changelog zod-changelog.md
EOF
    exit 1
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --from) FROM="$2"; shift 2 ;;
        --to) TO="$2"; shift 2 ;;
        --changelog) CHANGELOG="$2"; shift 2 ;;
        --output) OUTPUT="$2"; shift 2 ;;
        --help|-h) usage ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$FROM" || -z "$TO" || -z "$CHANGELOG" ]]; then
    echo "Error: --from, --to, and --changelog are required"
    usage
fi

if [[ ! -f "$CHANGELOG" ]]; then
    echo "Error: changelog file not found: $CHANGELOG"
    exit 1
fi

CHANGELOG_CONTENT=$(cat "$CHANGELOG")

# ---------------------------------------------------------------------------
# System prompt: tells the model exactly what to output
# ---------------------------------------------------------------------------
SYSTEM_PROMPT=$(cat <<'SYSPROMPT'
You are a change-detection tool. Your ONLY job is to read a Zod library changelog
and output a valid JSON object in the EXACT format below.

## Output Format (STRICT)

{
  "from": "<source_version>",
  "to": "<target_version>",
  "changes": [
    {
      "type": "new_constraint",
      "primitive": "string|number|bigint|date|array|set",
      "name": "constraint_name",
      "zod_api": "z.string().emoji()",
      "params": "{}",
      "source": "brief description from changelog"
    }
  ]
}

## Rules

1. type must be one of: new_constraint, new_type, new_modifier, changed_api
2. For new_constraint: include the primitive it applies to
3. For new_type: include name and zod_api (the Zod constructor)
4. For new_modifier: include name (e.g., "readonly")
5. params should be "{}" unless constraint takes specific parameters
6. source is a SHORT one-line description from the changelog
7. Output ONLY valid JSON. No markdown, no explanation, no code fences.
8. If there are no changes, output: { "from": "...", "to": "...", "changes": [] }

## Type Reference

Known Zod primitives: string, number, bigint, boolean, date, symbol, null, undefined, any, unknown, never, void, nan
Known constraint types on primitives: min, max, length, email, url, uuid, regex, cuid, cuid2, datetime, ip, startsWith, endsWith, includes, nonempty, trim, toLowerCase, toUpperCase, int, finite, positive, negative, nonnegative, nonpositive, multipleOf, safe
Known collection types: array, object, tuple, record, map, set
Known union/intersection types: union, discriminatedUnion, intersection
Known modifier types: optional, nullable, nullish, default, catch, brand, readonly, prefault

IF the changelog mentions any constraint/type/modifier NOT in the above lists, still include it.
SYSPROMPT
)

# ---------------------------------------------------------------------------
# User prompt: the actual changelog + instructions
# ---------------------------------------------------------------------------
USER_PROMPT=$(cat <<PROMPT
Parse the following Zod changelog (version $FROM → $TO) into structured delta JSON.

Changelog:
---
$CHANGELOG_CONTENT
---

Output ONLY valid JSON. No markdown, no explanation.
PROMPT
)

echo "🤖 Calling $ZEN_MODEL at $ZEN_BASE_URL ..." >&2
echo "   Changelog size: $(wc -c < "$CHANGELOG") bytes" >&2

# Build auth header if API key is set
AUTH_HEADER=()
if [[ -n "$ZEN_API_KEY" ]]; then
    AUTH_HEADER=(-H "Authorization: Bearer $ZEN_API_KEY")
fi

# ---------------------------------------------------------------------------
# Call the OpenAI-compatible API
# ---------------------------------------------------------------------------
RESPONSE=$(curl -s -S --max-time 120 \
    "$ZEN_BASE_URL/chat/completions" \
    -H "Content-Type: application/json" \
    "${AUTH_HEADER[@]}" \
    -d "$(jq -n \
        --arg model "$ZEN_MODEL" \
        --arg system "$SYSTEM_PROMPT" \
        --arg user "$USER_PROMPT" \
        '{
            model: $model,
            messages: [
                { role: "system", content: $system },
                { role: "user", content: $user }
            ],
            temperature: 0,
            max_tokens: 16384
        }')" 2>&1)

# ---------------------------------------------------------------------------
# Extract the assistant's message
# ---------------------------------------------------------------------------
CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null)

if [[ -z "$CONTENT" ]]; then
    echo "❌ API error or empty response:" >&2
    echo "$RESPONSE" | jq '.' >&2 2>/dev/null || echo "$RESPONSE" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Strip markdown code fences if the model wrapped JSON in them
# ---------------------------------------------------------------------------
CLEANED=$(echo "$CONTENT" | sed -n '/^```json/,/^```/p' | sed '1d;$d')
if [[ -n "$CLEANED" ]]; then
    CONTENT="$CLEANED"
fi
# Also try: strip leading/trailing ``` markers
CONTENT=$(echo "$CONTENT" | sed 's/^```json//;s/^```//;s/```$//' | sed '/^$/d')

# ---------------------------------------------------------------------------
# Validate it's valid JSON
# ---------------------------------------------------------------------------
if ! echo "$CONTENT" | jq '.' > /dev/null 2>&1; then
    echo "❌ Model output is not valid JSON:" >&2
    echo "$CONTENT" >&2
    exit 1
fi

# Add version info if missing
FINAL=$(echo "$CONTENT" | jq --arg from "$FROM" --arg to "$TO" '
    .from = (.from // $from) |
    .to = (.to // $to)
')

echo "$FINAL" | jq '.' > "$OUTPUT"

echo "✅ delta.json written to $OUTPUT" >&2
echo "   Changes detected: $(echo "$FINAL" | jq '.changes | length')" >&2
