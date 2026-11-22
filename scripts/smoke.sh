#!/usr/bin/env bash
#
# Post-deployment smoke test for CleanAir Companion.
#
#   scripts/smoke.sh https://cleanair-companion.vercel.app
#   npm run smoke -- https://cleanair-companion.vercel.app
#
# It checks the live origin, not the source tree:
#   1. / returns 200
#   2. the security headers are present (CSP, HSTS, nosniff, Referrer-Policy,
#      Permissions-Policy)
#   3. /api/health returns exactly {"status":"ok"}
#   4. a cross-origin POST to /api/plan is rejected
#   5. /sw.js is served and never caches /api/*
#
# Exit status: 0 = every check passed, 1 = at least one failed, 2 = bad usage.
# Every failure prints what was actually received, so it is usable in CI and by
# hand. No secrets are needed: the script only reads public responses.

set -uo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  printf 'usage: %s https://your-deployment.example\n' "$0" >&2
  exit 2
fi
BASE="${BASE%/}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAILED=0
PASSED=0

pass() {
  PASSED=$((PASSED + 1))
  printf 'PASS  %s\n' "$*"
}

fail() {
  FAILED=$((FAILED + 1))
  printf 'FAIL  %s\n' "$*"
}

# fetch URL OUTFILE -> prints the HTTP status (000 on a transport error)
fetch() {
  local url="$1" out="$2" status
  status="$(curl -sS --max-time 30 --dump-header "$out.headers" \
    --output "$out.body" --write-out '%{http_code}' "$url" 2>"$out.err")"
  if [ -z "$status" ]; then
    printf '000'
  else
    printf '%s' "$status"
  fi
}

header_value() { # header-file name -> last value, lower-cased name match
  awk -v name="$2" '
    BEGIN { IGNORECASE = 1 }
    index(tolower($0), tolower(name) ":") == 1 {
      sub(/^[^:]*:[[:space:]]*/, "")
      sub(/\r$/, "")
      value = $0
    }
    END { print value }
  ' "$1"
}

require_header() { # header-file name expected-substring label
  local value
  value="$(header_value "$1" "$2")"
  if [ -z "$value" ]; then
    fail "$4: $2 header is missing"
    return
  fi
  if [ -n "$3" ] && ! printf '%s' "$value" | grep -qi -- "$3"; then
    fail "$4: $2 does not contain '$3' (got: $value)"
    return
  fi
  pass "$4: $2"
}

printf 'Smoke testing %s\n\n' "$BASE"

# 1. Home page --------------------------------------------------------------
home_status="$(fetch "$BASE/" "$TMP/home")"
if [ "$home_status" = "200" ]; then
  pass "/ returns 200"
else
  fail "/ returned $home_status (expected 200)"
  sed -n '1,5p' "$TMP/home.err" 2>/dev/null
fi

# 2. Security headers on the document --------------------------------------
# HSTS is only sent in production over HTTPS, which is what this script targets.
require_header "$TMP/home.headers" 'content-security-policy' "default-src 'self'" '/ security'
require_header "$TMP/home.headers" 'strict-transport-security' 'max-age=' '/ security'
require_header "$TMP/home.headers" 'x-content-type-options' 'nosniff' '/ security'
require_header "$TMP/home.headers" 'referrer-policy' 'no-referrer' '/ security'
require_header "$TMP/home.headers" 'permissions-policy' 'geolocation=(self)' '/ security'

# 3. Health ----------------------------------------------------------------
health_status="$(fetch "$BASE/api/health" "$TMP/health")"
health_body="$(tr -d '\r\n' < "$TMP/health.body" 2>/dev/null)"
if [ "$health_status" = "200" ] && [ "$health_body" = '{"status":"ok"}' ]; then
  pass '/api/health returns 200 {"status":"ok"}'
else
  fail "/api/health returned $health_status with body: ${health_body:-<empty>}"
  printf '      A 503 here means the rate limiter is unavailable (Upstash not set\n'
  printf '      or unreachable), which is deliberate: see README "Deploy".\n'
fi

# 4. Cross-origin POST to /api/plan ---------------------------------------
plan_status="$(curl -sS --max-time 30 --dump-header "$TMP/plan.headers" \
  --output "$TMP/plan.body" --write-out '%{http_code}' \
  -X POST "$BASE/api/plan" \
  -H 'content-type: application/json' \
  -H 'origin: https://evil.example' \
  -H 'sec-fetch-site: cross-site' \
  --data '{"profile":{"language":"en"},"lat":28.61,"lon":77.21}' 2>"$TMP/plan.err")"
if [ "$plan_status" = "403" ]; then
  pass 'cross-origin POST /api/plan is rejected with 403'
else
  fail "cross-origin POST /api/plan returned $plan_status (expected 403)"
  printf '      body: %s\n' "$(head -c 300 "$TMP/plan.body" 2>/dev/null)"
fi
if grep -qi '^access-control-allow-origin:' "$TMP/plan.headers"; then
  fail 'no CORS header may be sent (found Access-Control-Allow-Origin)'
else
  pass 'no Access-Control-Allow-Origin header'
fi

# 5. Service worker must never cache /api ---------------------------------
sw_status="$(fetch "$BASE/sw.js" "$TMP/sw")"
if [ "$sw_status" != "200" ]; then
  fail "/sw.js returned $sw_status (expected 200)"
else
  pass '/sw.js returns 200'
  if grep -q "pathname.startsWith('/api/')" "$TMP/sw.body"; then
    pass '/sw.js skips every /api/ request'
  else
    fail "/sw.js has no /api/ bypass guard"
  fi
  # No cache write, shell precache or cacheable-asset predicate may name /api.
  if grep -E "cache\.(put|add|addAll)|SHELL_URLS|isCacheableAsset|SHELL_CACHE|ASSET_CACHE" \
    "$TMP/sw.body" | grep -q '/api/'; then
    fail '/sw.js caches or precaches an /api path'
  else
    pass '/sw.js never caches /api (no cache write names /api)'
  fi
fi

printf '\n%d passed, %d failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ]
