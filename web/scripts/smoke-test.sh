#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   KV_REST_API_URL=... KV_REST_API_TOKEN=... PHONE=+15555550123 ADDR=0x... \
#   bash scripts/smoke-test.sh prod
#
# For preview:
#   KV_REST_API_URL=... KV_REST_API_TOKEN=... PREVIEW_BASE_URL=https://<your-preview>.vercel.app \
#   bash scripts/smoke-test.sh preview

ENVIRONMENT=${1:-prod}

# Load env files automatically (no secrets committed)
# Priority: $ENVFILE > .env.smoke.$ENVIRONMENT > .env.local > .env
if [[ -n "${ENVFILE:-}" && -f "$ENVFILE" ]]; then
  set -a; source "$ENVFILE"; set +a
elif [[ -f ".env.smoke.$ENVIRONMENT" ]]; then
  set -a; source ".env.smoke.$ENVIRONMENT"; set +a
elif [[ -f ".env.local" ]]; then
  set -a; source ".env.local"; set +a
elif [[ -f ".env" ]]; then
  set -a; source ".env"; set +a
fi

PHONE=${PHONE:-+15555550123}
ADDR=${ADDR:-0x1111111111111111111111111111111111111111}
BASE_URL=${BASE_URL:-}

if [[ "$ENVIRONMENT" == "prod" ]]; then
  BASE_URL=${BASE_URL:-https://mintpass.org}
elif [[ "$ENVIRONMENT" == "preview" ]]; then
  # PREVIEW_BASE_URL must be provided, e.g., https://mintpass-xxxx.vercel.app
  BASE_URL=${BASE_URL:-${PREVIEW_BASE_URL:-}}
fi

if [[ -z "${BASE_URL}" ]]; then
  echo "ERROR: BASE_URL not set. For preview, set PREVIEW_BASE_URL or BASE_URL."
  exit 1
fi

if [[ -z "${KV_REST_API_URL:-}" || -z "${KV_REST_API_TOKEN:-}" ]]; then
  echo "ERROR: KV_REST_API_URL and KV_REST_API_TOKEN must be set for the target environment."
  exit 1
fi

echo "Environment: $ENVIRONMENT"
echo "Base URL:    $BASE_URL"
echo "Phone:       $PHONE"
echo "Address:     $ADDR"

PHONE_ESC=${PHONE//+/%2B}

post_json() {
  local url="$1"; shift
  local body="$1"; shift
  curl --fail --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    -X POST "$url" \
    -H 'content-type: application/json' \
    -d "$body"
}

kv_get_code() {
  # Returns the code or empty
  local resp
  resp=$(curl --fail-with-body --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    -H "Authorization: Bearer $KV_REST_API_TOKEN" \
    "$KV_REST_API_URL/get/sms:code:$PHONE_ESC")
  # Expecting JSON like: {"result":"123456"} or {"result":123456} or {"result":null}
  if command -v jq >/dev/null 2>&1; then
    echo "$resp" | jq -r '.result // empty' | grep -oE '^[0-9]{6}$' || true
  else
    # Fallback: match quoted or unquoted result then extract 6 digits
    echo "$resp" | grep -oE '"result":("[^"]+"|[0-9]+)' | grep -oE '[0-9]{6}' || true
  fi
}

step() {
  echo
  echo "==> $1"
}

step "Request SMS code"
post_json "$BASE_URL/api/sms/send" "{\"phoneE164\":\"$PHONE\",\"address\":\"$ADDR\"}"

step "Fetch code from Upstash"
CODE=""
for i in {1..8}; do
  CODE=$(kv_get_code)
  if [[ -n "$CODE" ]]; then break; fi
  sleep 2
done
if [[ -z "$CODE" ]]; then
  echo "ERROR: No code found in KV for $PHONE."
  exit 1
fi
echo "CODE=$CODE"

step "Verify code"
post_json "$BASE_URL/api/sms/verify" "{\"phoneE164\":\"$PHONE\",\"code\":\"$CODE\"}"

step "Check eligibility"
post_json "$BASE_URL/api/check-eligibility" "{\"address\":\"$ADDR\",\"phoneE164\":\"$PHONE\"}"

step "Mint (stubbed)"
post_json "$BASE_URL/api/mint" "{\"address\":\"$ADDR\",\"phoneE164\":\"$PHONE\"}"

echo
echo "Done."


