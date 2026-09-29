#!/usr/bin/env bash
# Read-only check: find the Lightfield contact(s) for an email and list the most
# recent notes with the contacts they are attached to. Local use only; never
# prints the key. Run under bws:
#
#   bws run --project-id <id> -- ./scripts/lightfield-contact-notes.sh <email>
set -euo pipefail

EMAIL=${1:?email required}
: "${LIGHTFIELD_API_KEY_FULL:?LIGHTFIELD_API_KEY_FULL not set (run under bws run)}"
lf() {
  printf 'Authorization: Bearer %s\n' "$LIGHTFIELD_API_KEY_FULL" |
    curl -sS -m 20 -f -G -H @- -H 'Lightfield-Version: 2026-03-01' "https://api.lightfield.app/v1/$1" "${@:2}"
}

echo "contacts matching $EMAIL:"
lf contacts --data-urlencode "\$email[contains]=$EMAIL" --data-urlencode limit=5 |
  jq -r '.data[] | "  \(.id)  \(.fields."$email".value)"'
echo "latest notes:"
lf notes --data-urlencode limit=5 |
  jq -r '.data[] | "  \(.createdAt)  \(.fields."$title".value)  -> contact: \(.relationships."$contact".values // [] | join(","))"'
