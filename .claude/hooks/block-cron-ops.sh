#!/usr/bin/env bash
# block-cron-ops.sh — hard-block CronCreate/CronDelete/CronList in loop sessions.
# Bypass: inline CRON_OPS_OVERRIDE=1 (conscious human override only).
# Deployed to <project>/.claude/hooks/ by /project:new, /project:update, /project:migrate.
#
# Hook contract (PreToolUse prompt-based hook):
#   stdin  = JSON with tool_name, tool_input, cwd
#   stdout = JSON array of hook decision objects
#   exit 2 = hard block (deny), exit 0 = allow

[[ "${CRON_OPS_OVERRIDE:-}" = "1" ]] && exit 0

tool_name="$(jq -r '.tool_name // empty' <<<"${CLAUDE_TOOL_INPUT:-}" 2>/dev/null || true)"
case "$tool_name" in
  CronCreate|CronDelete|CronList)
    cat <<'EOF'
[
  {
    "hookSpecificInput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "Cron operations (CronCreate, CronDelete, CronList) are forbidden in loop sessions. Cron jobs are human-managed. Use CRON_OPS_OVERRIDE=1 to bypass."
    }
  }
]
EOF
    exit 2
    ;;
esac
exit 0
