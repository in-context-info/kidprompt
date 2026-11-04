#!/usr/bin/env bash
# End-to-end smoke test against local dev servers (npm run dev:backend +
# npm run dev:admin, with DEV_LOG_CODES=true in backend/.dev.vars).
# Usage: scripts/smoke.sh <backend-log-file> <admin-email> <admin-password>
set -euo pipefail
B=${BACKEND:-http://localhost:8787}
A=${ADMIN:-http://localhost:8789}
LOG=$1; ADMIN_EMAIL=$2; ADMIN_PASSWORD=$3
JAR=$(mktemp); AJAR=$(mktemp)
EMAIL="smoke-$RANDOM@example.com"
j() { curl -sS -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' "$@"; echo; }
fail() { echo "FAIL: $*"; exit 1; }

echo "1. signup sends a code"; j -X POST "$B/api/signup" -d "{\"name\":\"Smoke Parent\",\"email\":\"$EMAIL\",\"password\":\"password123\"}" | grep -q '"ok":true' || fail signup
sleep 1; CODE=$(grep "signup code for $EMAIL" "$LOG" | tail -1 | grep -oE '[0-9]{6}$')
echo "2. wrong code rejected"; j -X POST "$B/api/signup/confirm" -d "{\"email\":\"$EMAIL\",\"code\":\"000000\"}" | grep -q error || fail wrongcode
echo "3. confirm creates account"; j -X POST "$B/api/signup/confirm" -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" | grep -q '"ok":true' || fail confirm
echo "4. me"; j "$B/api/me" | grep -q '"buildsLeftToday":25' || fail me
echo "5. add kid"; KID=$(j -X POST "$B/api/creators" -d '{"nickname":"Mia","emoji":"🦊"}' | sed -E 's/.*"id":"([^"]+)".*/\1/')
echo "6. create project"; PID=$(j -X POST "$B/api/projects" -d "{\"title\":\"Space Cat\",\"creatorId\":\"$KID\"}" | sed -E 's/.*"id":"([^"]+)".*/\1/')
echo "7. submit without code refused"; j -X POST "$B/api/projects/$PID/submit" | grep -q 'Build something' || fail emptysubmit
echo "8. paste code"; j -X PATCH "$B/api/projects/$PID" -d '{"html":"<!doctype html><html><body><h1>Space Cat</h1><script>fetch(\"https://evil.example\")</script></body></html>"}' | grep -q ok || fail paste
echo "9. draft preview is sandboxed"; curl -sS -D - -o /dev/null -b "$JAR" "$B/play/draft/$PID" | grep -qi 'content-security-policy: sandbox allow-scripts' || fail csp
echo "10. draft preview needs the owner session"; curl -sS "$B/play/draft/$PID" | grep -q "isn't here" || fail draftleak
echo "11. not public before review"; curl -sS "$B/api/games/$(j "$B/api/projects" | sed -E 's/.*"slug":"([^"]+)".*/\1/')" | grep -q 'not found' || fail early
echo "12. submit"; j -X POST "$B/api/projects/$PID/submit" | grep -q ok || fail submit
SLUG=$(j "$B/api/projects" | sed -E 's/.*"slug":"([^"]+)".*/\1/')
echo "13. admin login"; curl -sS -c "$AJAR" -o /dev/null -w '%{http_code}' -X POST "$A/login" --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" | grep -q 302 || fail adminlogin
echo "14. admin queue lists it"; curl -sS -b "$AJAR" "$A/" | grep -q "Space Cat" || fail queue
echo "15. admin review flags network use"; curl -sS -b "$AJAR" "$A/review/$PID" | grep -q "tries to use the network" || fail flags
echo "16. approve"; curl -sS -b "$AJAR" -o /dev/null -X POST "$A/review/$PID/approve" --data-urlencode "description=A cat in space"
echo "17. live in gallery"; curl -sS "$B/api/gallery" | grep -q "$SLUG" || fail gallery
echo "18. play serves published html"; curl -sS "$B/play/$SLUG" | grep -q "<h1>Space Cat</h1>" || fail play
echo "19. edit keeps live version"; j -X PATCH "$B/api/projects/$PID" -d '{"html":"<!doctype html><html><body><h1>Space Cat 2</h1></body></html>"}' >/dev/null
curl -sS "$B/play/$SLUG" | grep -q "<h1>Space Cat</h1>" || fail livechanged
j "$B/api/projects" | grep -q '"hasUnpublishedChanges":true' || fail changesflag
echo "20. play counter"; curl -sS -X POST "$B/api/games/$SLUG/play" >/dev/null; curl -sS "$B/api/games/$SLUG" | grep -q '"plays":1' || fail plays
echo "21. other accounts can't see it"; curl -sS "$B/api/projects/$PID" | grep -q 'Not logged in' || fail authz
echo "22. unauthenticated admin redirects"; curl -sS -o /dev/null -w '%{http_code}' "$A/" | grep -q 302 || fail adminauth
echo "ALL PASSED ($EMAIL, project $PID)"
