#!/usr/bin/env bash
# Copy KICKBOX_API_KEY from the environment into the Vercel project's
# production env. Never prints the key. Run under bws:
#
#   bws run --project-id <bws-project-id> -- ./scripts/push-kickbox-key.sh
#
# No live check: Kickbox takes the key in the URL and each verify spends a
# credit, so the form's first submission is the test (the function fails open).
set -euo pipefail

: "${KICKBOX_API_KEY:?KICKBOX_API_KEY not set (run under bws run)}"
SITE_DIR="$(cd "$(dirname "$0")/../site" && pwd)"

printf '%s' "$KICKBOX_API_KEY" |
  vercel env add KICKBOX_API_KEY production --sensitive --force --cwd "$SITE_DIR" >/dev/null
echo "KICKBOX_API_KEY set on Vercel project (production). Redeploy for it to take effect."
