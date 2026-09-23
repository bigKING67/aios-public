#!/usr/bin/env bash

set -euo pipefail

AIOS_BASE_URL="${AIOS_BASE_URL:-http://localhost:3000}"
SESSION_API_PREFIX="${SESSION_API_PREFIX:-/v1/auth/session}"
AIOS_ACCESS_COOKIE_NAME="${AIOS_ACCESS_COOKIE_NAME:-aios_access_token}"
AIOS_REFRESH_COOKIE_NAME="${AIOS_REFRESH_COOKIE_NAME:-aios_refresh_token}"

AIOS_TEST_USERNAME="${AIOS_TEST_USERNAME:-${DATAOPS_TEST_USERNAME:-}}"
AIOS_TEST_PASSWORD="${AIOS_TEST_PASSWORD:-${DATAOPS_TEST_PASSWORD:-}}"

HTTP_TIMEOUT_SEC="${HTTP_TIMEOUT_SEC:-20}"
HTTP_CONNECT_TIMEOUT_SEC="${HTTP_CONNECT_TIMEOUT_SEC:-8}"
COOKIE_JAR="${COOKIE_JAR:-/tmp/aios-cookie-session.cookies}"
KEEP_COOKIE_JAR="${KEEP_COOKIE_JAR:-0}"

RESPONSE_STATUS=""
RESPONSE_BODY=""

log() {
  printf '[cookie-smoke] %s\n' "$*"
}

fail() {
  printf '[cookie-smoke] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

normalize_base_url() {
  local raw="${1:-}"
  raw="${raw%/}"
  printf '%s' "$raw"
}

print_response_brief() {
  if [ -z "${RESPONSE_BODY:-}" ]; then
    echo '(empty body)'
    return
  fi

  if echo "$RESPONSE_BODY" | jq -e . >/dev/null 2>&1; then
    echo "$RESPONSE_BODY" | jq -c .
  else
    echo "$RESPONSE_BODY"
  fi
}

http_request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"

  local response_file
  response_file="$(mktemp)"

  local -a curl_args=(
    -sS
    --connect-timeout "$HTTP_CONNECT_TIMEOUT_SEC"
    --max-time "$HTTP_TIMEOUT_SEC"
    -o "$response_file"
    -w "%{http_code}"
    -X "$method"
    "$url"
    -H "Accept: application/json"
    -b "$COOKIE_JAR"
    -c "$COOKIE_JAR"
  )

  if [ -n "$body" ]; then
    curl_args+=(
      -H "Content-Type: application/json"
      --data "$body"
    )
  fi

  RESPONSE_STATUS="$(curl "${curl_args[@]}")"
  RESPONSE_BODY="$(cat "$response_file")"
  rm -f "$response_file"
}

expect_status() {
  local expected="$1"
  local step="$2"
  if [ "$RESPONSE_STATUS" != "$expected" ]; then
    log "step failed: $step"
    log "expected status: $expected, actual: $RESPONSE_STATUS"
    log "response:"
    print_response_brief
    exit 1
  fi

  log "ok: $step (HTTP $RESPONSE_STATUS)"
}

expect_json_expr() {
  local expr="$1"
  local step="$2"
  if ! echo "$RESPONSE_BODY" | jq -e "$expr" >/dev/null 2>&1; then
    log "step failed: $step"
    log "json assertion failed: $expr"
    log "response:"
    print_response_brief
    exit 1
  fi

  log "ok: $step"
}

cookie_exists() {
  local cookie_name="$1"

  awk -F'\t' -v target="$cookie_name" '
    {
      if ($0 ~ /^#HttpOnly_/) {
        line = substr($0, 10)
      } else if ($0 ~ /^#/) {
        next
      } else {
        line = $0
      }

      n = split(line, cols, "\t")
      if (n >= 7 && cols[6] == target && cols[7] != "") {
        found = 1
        exit
      }
    }
    END { exit found ? 0 : 1 }
  ' "$COOKIE_JAR"
}

tamper_cookie_value() {
  local cookie_name="$1"
  local cookie_value="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -F'\t' -v OFS='\t' -v target="$cookie_name" -v replacement="$cookie_value" '
    {
      if ($0 ~ /^#HttpOnly_/) {
        line = substr($0, 10)
        n = split(line, cols, "\t")
        if (n >= 7 && cols[6] == target) {
          cols[7] = replacement
          line = cols[1]
          for (i = 2; i <= n; i++) {
            line = line OFS cols[i]
          }
        }
        print "#HttpOnly_" line
        next
      }

      if ($0 ~ /^#/) {
        print $0
        next
      }

      n = split($0, cols, "\t")
      if (n >= 7 && cols[6] == target) {
        cols[7] = replacement
        line = cols[1]
        for (i = 2; i <= n; i++) {
          line = line OFS cols[i]
        }
        print line
      } else {
        print $0
      }
    }
  ' "$COOKIE_JAR" >"$tmp_file"

  mv "$tmp_file" "$COOKIE_JAR"
}

cleanup_cookie_jar() {
  if [ "$KEEP_COOKIE_JAR" = "1" ]; then
    log "keep cookie jar: $COOKIE_JAR"
    return
  fi

  rm -f "$COOKIE_JAR"
}

main() {
  require_cmd curl
  require_cmd jq
  require_cmd awk

  if [ -z "$AIOS_TEST_USERNAME" ] || [ -z "$AIOS_TEST_PASSWORD" ]; then
    fail "set AIOS_TEST_USERNAME and AIOS_TEST_PASSWORD (or DATAOPS_TEST_USERNAME/PASSWORD)"
  fi

  local base_url
  base_url="$(normalize_base_url "$AIOS_BASE_URL")"

  local login_url="${base_url}${SESSION_API_PREFIX}/login"
  local me_url="${base_url}${SESSION_API_PREFIX}/me"
  local refresh_url="${base_url}${SESSION_API_PREFIX}/refresh"
  local logout_url="${base_url}${SESSION_API_PREFIX}/logout"

  : >"$COOKIE_JAR"

  log "base url: $base_url"
  log "cookie jar: $COOKIE_JAR"

  local login_payload
  login_payload="$(jq -cn --arg u "$AIOS_TEST_USERNAME" --arg p "$AIOS_TEST_PASSWORD" '{username:$u,password:$p}')"

  log "step 1: login"
  http_request "POST" "$login_url" "$login_payload"
  expect_status "200" "login"
  expect_json_expr '.user.username | type == "string" and length > 0' "login response has user.username"
  cookie_exists "$AIOS_ACCESS_COOKIE_NAME" || fail "access cookie not found: $AIOS_ACCESS_COOKIE_NAME"
  cookie_exists "$AIOS_REFRESH_COOKIE_NAME" || fail "refresh cookie not found: $AIOS_REFRESH_COOKIE_NAME"

  log "step 2: me with fresh session"
  http_request "GET" "$me_url"
  expect_status "200" "me after login"
  expect_json_expr '.user.username | type == "string" and length > 0' "me response has user.username"

  log "step 3: explicit refresh"
  http_request "POST" "$refresh_url"
  expect_status "200" "refresh"
  expect_json_expr '.success == true' "refresh response success"

  log "step 4: logout"
  http_request "POST" "$logout_url"
  expect_status "200" "logout"
  expect_json_expr '.success == true' "logout response success"

  log "step 5: me must be unauthorized after logout"
  http_request "GET" "$me_url"
  expect_status "401" "me after logout"

  log "step 6: login again for 401-recovery simulation"
  http_request "POST" "$login_url" "$login_payload"
  expect_status "200" "login (2nd)"

  log "step 7: tamper access cookie and verify 401"
  tamper_cookie_value "$AIOS_ACCESS_COOKIE_NAME" "invalid_access_token_for_smoke"
  http_request "GET" "$me_url"
  expect_status "401" "me with tampered access token"

  log "step 8: refresh using valid refresh cookie"
  http_request "POST" "$refresh_url"
  expect_status "200" "refresh after tampered access token"

  log "step 9: me succeeds again after refresh"
  http_request "GET" "$me_url"
  expect_status "200" "me after refresh recovery"

  cleanup_cookie_jar
  log "all checks passed"
}

main "$@"
