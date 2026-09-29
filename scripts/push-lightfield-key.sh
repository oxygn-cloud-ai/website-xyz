#!/usr/bin/env bash
# Copy LIGHTFIELD_API_KEY from the environment into the Vercel project's
# production env, after checking the key is live and has the scopes the
# contact form needs. Never prints the key. Intended to be run under bws:
#
#   bws run --project-id <bws-project-id> -- ./scripts/push-lightfield-key.sh
set -euo pipefail

: "${LIGHTFIELD_API_KEY:?LIGHTFIELD_API_KEY not set (run under bws run)}"
SITE_DIR="$(cd "$(dirname "$0")/../site" && pwd)"

# Header goes to curl on stdin so the key never appears in argv / ps.
resp=$(printf 'Authorization: Bearer %s\n' "$LIGHTFIELD_API_KEY" |
  curl -sS -m 20 -w '\n%{http_code}' -H @- -H 'Lightfield-Version: 2026-03-01' \
    https://api.lightfield.app/v1/auth/validate)
code=${resp##*$'\n'}
body=${resp%$'\n'*}
if [ "$code" != 200 ]; then
  echo "Lightfield rejected the key (HTTP $code). Nothing written to Vercel." >&2
  exit 1
fi

scopes=$(printf '%s' "$body" | jq -r '.scopes | join(" ")')
echo "Lightfield key active ($(printf '%s' "$body" | jq -r .subjectType) key); scopes: ${scopes:-full access}"
if [ -n "$scopes" ]; then
  for need in contacts:create notes:create; do
    case " $scopes " in *" $need "*) ;; *) echo "Key lacks scope $need. Nothing written to Vercel." >&2; exit 1 ;; esac
  done
fi

printf '%s' "$LIGHTFIELD_API_KEY" |
  vercel env add LIGHTFIELD_API_KEY production --sensitive --force --cwd "$SITE_DIR" >/dev/null
echo "LIGHTFIELD_API_KEY set on Vercel project (production)."
