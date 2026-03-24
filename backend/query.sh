#!/usr/bin/env bash
# query.sh – send a query to the agent API and show load time in the response.
# Usage:
#   ./query.sh "How many cybersecurity professionals are employed in Ireland?"
#   ./query.sh                    (prompts interactively)

set -euo pipefail

API_URL="${API_URL:-http://localhost:8000/query}"

# ── Get the query ────────────────────────────────────────────────────────────
if [[ $# -ge 1 ]]; then
  QUERY="$*"
else
  printf "Enter query: "
  read -r QUERY
fi

# ── Build JSON payload ───────────────────────────────────────────────────────
PAYLOAD=$(printf '{"query": %s}' "$(echo "$QUERY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')")

# ── Run curl ─────────────────────────────────────────────────────────────────
_start=$SECONDS
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>&1)
CURL_EXIT=$?
elapsed=$(( SECONDS - _start ))

# ── Handle errors ─────────────────────────────────────────────────────────────
if [[ $CURL_EXIT -ne 0 ]]; then
  echo "❌ curl failed (exit $CURL_EXIT):"
  echo "$RESPONSE"
  exit $CURL_EXIT
fi

# ── Pretty-print the response ────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$RESPONSE" | python3 -c "
import json, sys

data = json.loads(sys.stdin.read())

print('ANSWER')
print('  ' + data.get('answer',''))
print()

citations = data.get('citations', [])
if citations:
    print('CITATIONS')
    for c in citations:
        snippet = c['text'][:120].replace('\n',' ')
        print(f'  [Page {c[\"page\"]}] {snippet}')
    print()

trace = data.get('trace', [])
if trace:
    print(f'TRACE  ({len(trace)} steps)')
    for s in trace:
        print(f'  Step {s[\"step\"]}: {s[\"action\"]}  →  {s[\"action_input\"][:80]}')
"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⏱  Response time: ${elapsed}s"
