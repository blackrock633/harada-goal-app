#!/usr/bin/env bash
# QA regression run: executes every available gate against the working tree and records
# what actually happened. Never edits source or databases; e2e uses its own PGlite dir.
#
#   bash tests/qa-regress.sh                    # all gates on this checkout
#   bash tests/qa-regress.sh <checkout-dir>     # e.g. .claude/worktrees/ui-integration
#   SKIP_E2E=1 bash tests/qa-regress.sh         # no dev server / browser
#
# Gates run inside the target checkout; the QA e2e specs and logs always come from this checkout.
# Output: test-results/qa/<timestamp>.log plus a one-line-per-gate summary on stdout.
#   SNAPSHOT=1 bash tests/qa-regress.sh <checkout-dir>
#       test the checkout's committed HEAD (git archive into a temp dir), not its live working
#       tree. Use this for other agents' worktrees: their uncommitted mid-edit state is not a regression.
set -u
QA_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$(cd "${1:-$QA_ROOT}" && pwd)"
if [ -n "${SNAPSHOT:-}" ]; then
  REV=$(git -C "$TARGET" rev-parse --short HEAD)
  SNAP=$(mktemp -d -t "qa-snap-$REV")
  git -C "$TARGET" archive HEAD | tar -x -C "$SNAP"
  ln -s "$TARGET/node_modules" "$SNAP/node_modules"
  trap 'rm -rf "$SNAP"' EXIT
  echo "snapshot of $TARGET @ $REV -> $SNAP"
  TARGET_GIT="$TARGET"; TARGET="$SNAP"
fi
TARGET_GIT="${TARGET_GIT:-$TARGET}"
cd "$TARGET"

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$QA_ROOT/test-results/qa"
mkdir -p "$OUT"
LOG="$OUT/$STAMP.log"
PORT=${E2E_PORT:-3125}
SUMMARY=()

gate() { # gate <name> <command...>
  local name=$1; shift
  echo "===== $name: $*" >>"$LOG"
  if "$@" >>"$LOG" 2>&1; then SUMMARY+=("PASS  $name"); else SUMMARY+=("FAIL  $name (exit $?)"); fi
}

g() { git -C "$TARGET_GIT" "$@"; }
echo "QA run $STAMP on $TARGET_GIT @ $(g rev-parse --abbrev-ref HEAD)/$(g rev-parse --short HEAD) ($(g status --porcelain | wc -l | tr -d ' ') uncommitted paths$([ -n "${SNAPSHOT:-}" ] && echo '; uncommitted changes NOT tested (snapshot of HEAD)'))" | tee "$LOG"

gate typecheck npm run --silent typecheck
gate lint      npx eslint .
gate vitest    npx vitest run

# Guard against silently lost tests: compare the executed test count with the last run on this branch.
BRANCH=$(g rev-parse --abbrev-ref HEAD | tr '/' '_')
COUNT=$(grep -Eo 'Tests +[0-9]+ failed \| [0-9]+ passed|Tests +[0-9]+ passed' "$LOG" | tail -1 | grep -Eo '[0-9]+' | paste -sd+ - | bc)
PREV=$(cat "$OUT/count-$BRANCH" 2>/dev/null || echo 0)
if [ -n "$COUNT" ] && [ "$COUNT" -lt "$PREV" ]; then
  SUMMARY+=("FAIL  test count dropped $PREV -> $COUNT on $BRANCH (tests silently not running?)")
else
  SUMMARY+=("PASS  test count ${COUNT:-?} (previous $PREV)")
fi
[ -n "$COUNT" ] && echo "$COUNT" >"$OUT/count-$BRANCH"

if [ -z "${SKIP_E2E:-}" ]; then
  # Local dev auth + a fresh embedded DB: exercises real pages, use cases and RLS without a Supabase project.
  AUTH_PROVIDER=dev DEV_AUTH_SECRET=qa-regress-secret-0123456789 \
  DATABASE_URL="pglite://$OUT/e2e-db-$STAMP" npx next dev -p "$PORT" >>"$LOG.server" 2>&1 &
  SERVER=$!
  for _ in $(seq 1 90); do curl -s -o /dev/null "http://localhost:$PORT/api/health" && break; sleep 1; done
  for path in / /styleguide /api/health; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$path")
    [ "$code" = 200 ] && SUMMARY+=("PASS  GET $path") || SUMMARY+=("FAIL  GET $path -> $code")
  done
  # Uses system Chrome until `npx playwright install chromium` has been run.
  CFG="$OUT/pw-$STAMP.config.mjs"
  cat >"$CFG" <<EOF
export default { testDir: '$QA_ROOT/tests/e2e', workers: 1, reporter: [['list']],
  outputDir: '$OUT/pw-$STAMP', use: { baseURL: 'http://localhost:$PORT', channel: 'chrome' } };
EOF
  # Run from QA_ROOT so the specs and the runner share one @playwright/test install.
  gate e2e bash -c "cd '$QA_ROOT' && npx playwright test -c '$CFG'"
  kill "$SERVER" 2>/dev/null; pkill -f "next dev -p $PORT" 2>/dev/null
  rm -rf "$CFG" "$OUT/e2e-db-$STAMP"
else
  SUMMARY+=("SKIP  e2e (SKIP_E2E set)")
fi

echo "----- summary" | tee -a "$LOG"
printf '%s\n' "${SUMMARY[@]}" | tee -a "$LOG"
grep -E "Tests +[0-9]|[0-9]+ (passed|failed|skipped)|problems|error TS" "$LOG" | sort | uniq -c | tee -a "$LOG"
echo "log: $LOG"
