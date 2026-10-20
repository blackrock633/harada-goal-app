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
#   QA_WORKERS=2 ...   cap vitest workers (default 4; each PGlite DB is CPU-heavy)
set -u
# Keep the Mac awake for the whole run: idle sleep froze test workers mid-run and produced phantom
# multi-minute "hangs" on random tests (pmset sleep=1 on this machine).
if [ -z "${QA_CAFFEINATED:-}" ] && command -v caffeinate >/dev/null; then
  QA_CAFFEINATED=1 exec caffeinate -i "$0" "$@"
fi
# Scratch space Spotlight/XProtect skip (".noindex"): indexing every snapshot and PGlite DB
# pushed load past 25 on a 10-core machine and turned test hooks into timeouts.
SCRATCH="${TMPDIR:-/tmp}/qa.noindex"
mkdir -p "$SCRATCH"
QA_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$(cd "${1:-$QA_ROOT}" && pwd)"
if [ -n "${SNAPSHOT:-}" ]; then
  REV=$(git -C "$TARGET" rev-parse --short HEAD)
  SNAP=$(mktemp -d "$SCRATCH/snap-$REV.XXXXXX")
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
gate vitest    npx vitest run --maxWorkers="${QA_WORKERS:-4}"

# Guard against silently lost tests. Vitest prints e.g. "Tests  317 passed (490)": the number in
# parentheses is the total collected. Tests that never ran (crashed worker, file that failed to load)
# show up as total > passed + failed + skipped, or as a drop in the total versus the last run.
BRANCH=$(g rev-parse --abbrev-ref HEAD | tr '/' '_')
TLINE=$(awk '/===== vitest/,/===== e2e|----- summary/' "$LOG" | grep -E '^ +Tests ' | tail -1)
TOTAL=$(echo "$TLINE" | grep -Eo '\(([0-9]+)\)' | tr -d '()')
RAN=$(echo "$TLINE" | grep -Eo '[0-9]+ (passed|failed|skipped|expected fail|todo)' | grep -Eo '^[0-9]+' | paste -sd+ - | bc)
PREV=$(cat "$OUT/count-$BRANCH" 2>/dev/null || echo 0)
if [ -z "$TOTAL" ]; then
  SUMMARY+=("FAIL  test count unreadable (vitest summary missing)")
elif [ "${RAN:-0}" -lt "$TOTAL" ]; then
  SUMMARY+=("FAIL  only ${RAN:-0} of $TOTAL tests ran (crashed worker or unloadable file)")
elif [ "$TOTAL" -lt "$PREV" ]; then
  SUMMARY+=("FAIL  test count dropped $PREV -> $TOTAL on $BRANCH")
else
  SUMMARY+=("PASS  test count $TOTAL ran (previous $PREV)")
  echo "$TOTAL" >"$OUT/count-$BRANCH"
fi

if [ -z "${SKIP_E2E:-}" ]; then
  # Local dev auth + a fresh embedded DB: exercises real pages, use cases and RLS without a Supabase project.
  AUTH_PROVIDER=dev DEV_AUTH_SECRET=qa-regress-secret-0123456789 \
  DATABASE_URL="pglite://$SCRATCH/e2e-db-$STAMP" npx next dev -p "$PORT" >>"$LOG.server" 2>&1 &
  SERVER=$!
  for _ in $(seq 1 90); do curl -s -o /dev/null "http://localhost:$PORT/api/health" && break; sleep 1; done
  for path in / /styleguide /api/health; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT$path")
    # 2xx, or a redirect (e.g. / -> /signin when signed out); 5xx and 4xx fail.
    case "$code" in 2??|30[1278]) SUMMARY+=("PASS  GET $path -> $code");; *) SUMMARY+=("FAIL  GET $path -> $code");; esac
  done
  # Chrome via the system install; WebKit via Playwright's own build.
  CFG="$OUT/pw-$STAMP.config.mjs"
  cat >"$CFG" <<EOF
export default { testDir: '$QA_ROOT/tests/e2e', workers: 1, reporter: [['list']], timeout: 90000, expect: { timeout: 10000 },
  outputDir: '$OUT/pw-$STAMP', use: { baseURL: 'http://localhost:$PORT' },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    // Safari's engine with an iPhone UA (needs: npx playwright install webkit). Not a real device.
    { name: 'webkit-iphone', use: { browserName: 'webkit', deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } },
  ] };
EOF
  # Run from QA_ROOT so the specs and the runner share one @playwright/test install.
  gate e2e bash -c "cd '$QA_ROOT' && npx playwright test -c '$CFG'"
  kill "$SERVER" 2>/dev/null; pkill -f "next dev -p $PORT" 2>/dev/null
  rm -rf "$CFG" "$SCRATCH/e2e-db-$STAMP"
else
  SUMMARY+=("SKIP  e2e (SKIP_E2E set)")
fi

echo "----- summary" | tee -a "$LOG"
printf '%s\n' "${SUMMARY[@]}" | tee -a "$LOG"
grep -E "Tests +[0-9]|[0-9]+ (passed|failed|skipped)|problems|error TS" "$LOG" | sort | uniq -c | tee -a "$LOG"
echo "log: $LOG"
