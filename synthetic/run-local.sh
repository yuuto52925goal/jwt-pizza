#!/usr/bin/env bash
# Build the current checkout, serve it locally, and run the synthetic suite against it
# (frontend = this build, backend = the REAL production service).
# Usage: bash synthetic/run-local.sh
set -u
cd "$(dirname "$0")/.."
npm run build >/dev/null || exit 1
# Not npx: $! must be vite itself, or the trap kills only the wrapper and port 4173 stays taken.
node_modules/.bin/vite preview --port 4173 --strictPort >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
for _ in $(seq 30); do curl -s -o /dev/null http://localhost:4173 && break; sleep 0.5; done
SITE_URL=http://localhost:4173 npx playwright test -c synthetic/playwright.config.ts --reporter=line
