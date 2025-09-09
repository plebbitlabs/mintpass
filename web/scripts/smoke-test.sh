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
AUTHOR=${AUTHOR:-smoke-author}
BASE_URL=${BASE_URL:-}
COOKIE_JAR=${COOKIE_JAR:-/tmp/mintpass_smoke_cookies.$$}
trap 'rm -f "$COOKIE_JAR" >/dev/null 2>&1 || true' EXIT

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

with_bypass_param() {
  local url="$1"
  if [[ -n "${BYPASS_TOKEN:-}" ]]; then
    if [[ "$url" == *"?"* ]]; then
      echo "$url&x-vercel-protection-bypass=$BYPASS_TOKEN"
    else
      echo "$url?x-vercel-protection-bypass=$BYPASS_TOKEN"
    fi
  else
    echo "$url"
  fi
}

post_json() {
  local url="$1"; shift
  local body="$1"; shift
  if [[ -n "${BYPASS_TOKEN:-}" ]]; then
    local u
    u=$(with_bypass_param "$url")
    if [[ -n "${SMOKE_TEST_TOKEN:-}" ]]; then
      curl -sS -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$u" \
        -H "x-vercel-protection-bypass: $BYPASS_TOKEN" \
        -H "x-smoke-test-token: $SMOKE_TEST_TOKEN" \
        -H 'content-type: application/json' \
        -d "$body"
    else
      curl -sS -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$u" \
        -H "x-vercel-protection-bypass: $BYPASS_TOKEN" \
        -H 'content-type: application/json' \
        -d "$body"
    fi
  else
    if [[ -n "${SMOKE_TEST_TOKEN:-}" ]]; then
      curl -sS -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$url" \
        -H "x-smoke-test-token: $SMOKE_TEST_TOKEN" \
        -H 'content-type: application/json' \
        -d "$body"
    else
      curl -sS -i -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$url" \
        -H 'content-type: application/json' \
        -d "$body"
    fi
  fi
}

kv_get_code() {
  # Returns the code or empty
  local key
  if [[ -n "${HASH_PEPPER:-}" ]]; then
    # Compute HMAC-SHA256("phone:" + PHONE) in hex (domain-separated)
    local hex
    if command -v openssl >/dev/null 2>&1; then
      local msg
      msg="phone:${PHONE}"
      # Compatible parsing across OpenSSL variants
      hex=$(printf "%s" "$msg" | openssl dgst -sha256 -hmac "$HASH_PEPPER" 2>/dev/null | sed 's/^.*= //')
    elif command -v node >/dev/null 2>&1; then
      hex=$(HASH_PEPPER="$HASH_PEPPER" PHONE="$PHONE" node -e "const c=require('crypto');const p=process.env.HASH_PEPPER;const ph=process.env.PHONE||'';const h=c.createHmac('sha256',p).update('phone:'+ph).digest('hex');console.log(h)" 2>/dev/null)
    else
      echo "ERROR: HASH_PEPPER is set but neither openssl nor node is available to compute the HMAC." 1>&2
      echo "Install openssl or node, or unset HASH_PEPPER for plaintext fallback (not recommended for preview/prod)." 1>&2
      exit 1
    fi
    key="sms:code:${hex}"
  else
    key="sms:code:${PHONE_ESC}"
  fi
  local resp
  resp=$(curl -sS -H "Authorization: Bearer $KV_REST_API_TOKEN" \
    "$KV_REST_API_URL/get/$key")
  # Expecting JSON like: {"result":"123456"} or {"result":null}
  echo "$resp" | grep -oE '"result":"[0-9]{6}"' | grep -oE '[0-9]{6}' || true
}

debug_get_code() {
  # Returns the code from the Preview function (requires SMOKE_TEST_TOKEN) or empty
  if [[ -z "${SMOKE_TEST_TOKEN:-}" ]]; then
    return 0
  fi
  local url
  url=$(with_bypass_param "$BASE_URL/api/debug/code")
  local resp
  resp=$(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -X POST "$url" \
    -H "x-smoke-test-token: $SMOKE_TEST_TOKEN" \
    -H 'content-type: application/json' \
    -d "{\"phoneE164\":\"$PHONE\"}")
  echo "$resp" | grep -oE '"code":"[0-9]{6}"' | grep -oE '[0-9]{6}' || true
}

step() {
  echo
  echo "==> $1"
}

if [[ -n "${BYPASS_TOKEN:-}" ]]; then
  step "Set Vercel bypass cookie"
  # Set the Vercel protection bypass cookie for this domain
  curl -sS -i -c "$COOKIE_JAR" \
    "$(with_bypass_param "$BASE_URL/?x-vercel-set-bypass-cookie=true")" >/dev/null || true
fi

step "Request SMS code"
post_json "$BASE_URL/api/sms/send" "{\"phoneE164\":\"$PHONE\",\"address\":\"$ADDR\"}"

step "Fetch code"
CODE=""
# Try preview debug endpoint first when SMOKE_TEST_TOKEN is set
if [[ -n "${SMOKE_TEST_TOKEN:-}" ]]; then
  for i in {1..4}; do
    CODE=$(debug_get_code)
    if [[ -n "$CODE" ]]; then break; fi
    sleep 1
  done
fi

# Fallback to Upstash REST if needed
if [[ -z "$CODE" ]]; then
  for i in {1..8}; do
    CODE=$(kv_get_code)
    if [[ -n "$CODE" ]]; then break; fi
    sleep 2
  done
fi
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
post_json "$BASE_URL/api/mint" "{\"address\":\"$ADDR\",\"phoneE164\":\"$PHONE\",\"authorAddress\":\"$AUTHOR\"}"

echo
echo "Done."


