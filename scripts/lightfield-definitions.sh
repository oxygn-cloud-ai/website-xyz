#!/usr/bin/env bash
# Print Lightfield field/relationship definitions (keys, labels, types) for an
# object type. Local use only; never prints the key. Run under bws:
#
#   bws run --project-id <bws-project-id> -- ./scripts/lightfield-definitions.sh contacts
set -euo pipefail

OBJ=${1:?usage: lightfield-definitions.sh <contacts|accounts|notes|...>}
[[ "$OBJ" =~ ^[a-z_]+$ ]] || { echo "Invalid object type: $OBJ" >&2; exit 1; }
: "${LIGHTFIELD_API_KEY_FULL:?LIGHTFIELD_API_KEY_FULL not set (run under bws run)}"

printf 'Authorization: Bearer %s\n' "$LIGHTFIELD_API_KEY_FULL" |
  curl -sS -m 20 -f -H @- -H 'Lightfield-Version: 2026-03-01' \
    "https://api.lightfield.app/v1/$OBJ/definitions" |
  jq -r '"fields:", (.fieldDefinitions | to_entries[] | "  \(.key)\t\(.value.label)\t\(.value.valueType // .value.typeConfiguration.type // "?")"),
         "relationships:", (.relationshipDefinitions // {} | to_entries[] | "  \(.key)\t\(.value.label // "")")'
