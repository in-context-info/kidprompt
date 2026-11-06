#!/usr/bin/env bash
# End-to-end test of "Try it" without an account, against local dev servers
# with DEV_FAKE_BUILDS=true and DEV_LOG_CODES=true in backend/.dev.vars.
# Usage: scripts/smoke-guest.sh <backend-log-file> <admin-email> <admin-password>
# Uses the default limits (3 per guest, 6 per network per day); run it on a
# fresh local database, since earlier runs count toward the per-network limit.
set -euo pipefail
B=${BACKEND:-http://localhost:8787}
A=${ADMIN:-http://localhost:8789}
LOG=$1; ADMIN_EMAIL=$2; ADMIN_PASSWORD=$3
G1=$(mktemp); G2=$(mktemp); G3=$(mktemp); AJAR=$(mktemp)
fail() { echo "FAIL: $*"; exit 1; }
build() { curl -sS -b "$1" -c "$1" -H 'Content-Type: application/json' -X POST "$B/api/guest/build" -d "{\"prompt\":\"$2\",\"title\":\"Guest Cat\"}"; echo; }

echo "1. a new visitor has 3 tries"; curl -sS "$B/api/guest" | grep -q '"buildsLeft":3' || fail start
echo "2. three builds work without an account"
build "$G1" "a cat game" | grep -q '"buildsLeft":2' || fail b1
build "$G1" "make it purple" | grep -q '"buildsLeft":1' || fail b2
build "$G1" "add stars" | grep -q '"buildsLeft":0' || fail b3
echo "3. the fourth is refused with signup_required"; build "$G1" "more" | grep -q 'signup_required' || fail b4
echo "4. guest preview is sandboxed and private"
curl -sS -D - -o /dev/null -b "$G1" "$B/play/guest/current" | grep -qi 'content-security-policy: sandbox' || fail csp
curl -sS -b "$G1" "$B/play/guest/current" | grep -q 'add stars' || fail preview
curl -sS "$B/play/guest/current" | grep -q "isn't here" || fail leak
echo "5. clearing cookies doesn't reset the per-network limit"
for p in one two three; do build "$G2" "$p" >/dev/null; done
build "$G3" "sneaky" | grep -q 'signup_required' || fail iplimit
echo "6. signup claims the guest game"
EMAIL="guest-smoke-$RANDOM@example.com"
curl -sS -b "$G1" -c "$G1" -H 'Content-Type: application/json' -X POST "$B/api/signup" -d "{\"name\":\"Guest Parent\",\"email\":\"$EMAIL\",\"password\":\"password123\"}" >/dev/null
sleep 1; CODE=$(grep "signup code for $EMAIL" "$LOG" | tail -1 | grep -oE '[0-9]{6}$')
OLD=$(cp "$G1" "$G1.old"; echo "$G1.old")
PID=$(curl -sS -b "$G1" -c "$G1" -H 'Content-Type: application/json' -X POST "$B/api/signup/confirm" -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" | sed -nE 's/.*"claimedProjectId":"([^"]+)".*/\1/p')
[ -n "$PID" ] || fail claim
curl -sS -b "$G1" "$B/api/projects/$PID" | grep -q 'add stars' || fail claimedhtml
[ "$(curl -sS -b "$G1" "$B/api/projects/$PID" | grep -o '"prompt"' | wc -l | tr -d ' ')" = 3 ] || fail versions
echo "7. the old guest cookie can't claim twice or keep building"
curl -sS -b "$OLD" "$B/api/guest" | grep -q '"project":null' || fail reuse
echo "8. claimed game is private until shared"; curl -sS "$B/api/gallery" | grep -q 'Guest Cat' && fail public || true
echo "9. admin Guests page tracks it"
curl -sS -c "$AJAR" -o /dev/null -X POST "$A/login" --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD"
PAGE=$(curl -sS -b "$AJAR" "$A/guests")
echo "$PAGE" | grep -q "Guest Cat" || fail adminlist
echo "$PAGE" | grep -q "$EMAIL" || fail adminclaim
echo "$PAGE" | grep -A1 "Blocked: used all free tries" | grep -q '<b>1</b>' || fail adminblock
echo "$PAGE" | grep -A1 "Blocked: per-network" | grep -q '<b>1</b>' || fail adminipblock
curl -sS -b "$AJAR" "$A/" | grep -q "Guest builds (24h)" || fail adminstat
echo "ALL PASSED"
