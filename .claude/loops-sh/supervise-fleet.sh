#!/usr/bin/env bash
# supervise-fleet.sh — fleet-level watchdog for SHELL-DRIVER roles only (CPT-840).
# Session-driver roles MUST NOT be auto-restarted — their cron state is in-memory.
#
# WHY THIS EXISTS
# ---------------
# The per-role watchdog supervise.sh (CPT-554) is started ONLY from the shell
# wrappers .claude/loops-sh/<role>.sh, which run ONLY when a role's
# .loops.<role>.driver == "shell". Since CPT-654/660 made driver:session the
# single standard, no wrapper runs, so supervise.sh never starts and NO role —
# including Master — has an active auto-restart watchdog. Recovery was 100%
# manual (CPT-761/808/828).
#
# This is a SINGLE fleet-level watchdog, independent of per-role drivers: one
# loop reads every .loops role's heartbeat and re-creates the tmux session for
# any DEAD role (session-driver roles are launched as tmux sessions by
# launch.md's tmux backend; the restart action here mirrors launch.md Step 5T).
#
# SCOPE: tmux backend only. The iTerm2 backend has no programmatic
# session-recreation surface comparable to tmux, so fleet auto-restart does not
# cover it (documented in commands/launch.md).
#
# Usage: supervise-fleet.sh            (reads roles + interval from PROJECT_CONFIG.json)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR/../.." rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/../..")"
CONFIG="${REPO_ROOT}/PROJECT_CONFIG.json"
STATE_DIR="${REPO_ROOT}/.claude/state"
ALERTS_DIR="${REPO_ROOT}/.claude/alerts"
FLEET_LOCK_NAME="fleet-supervisor"

. "${SCRIPT_DIR}/_lib.sh"

# --- Project identity (re-derived; this runs standalone, not from launch.md) ---
# Mirror commands/launch.md: PROJECT_SLUG from .project.name, both sanitised the
# same way. CPT-1212: no global PROVIDER — each role resolves its own provider
# from PROJECT_CONFIG.json in recreate_session().
PROJECT_NAME="$(jq -r '.project.name // empty' "$CONFIG" 2>/dev/null || true)"
[ -z "$PROJECT_NAME" ] && PROJECT_NAME="$(basename "$REPO_ROOT")"
PROJECT_SLUG="$(echo "$PROJECT_NAME" | tr '.' '-' | tr ':' '-' | tr ' ' '-')"

# --- Cadence ---
# Check on the shortest role interval so the fastest role is not under-watched;
# DEAD is judged per-role against 6× that role's own interval (Master's rule).
MIN_INTERVAL="$(jq -r '[.loops[]?.intervalMinutes // empty] | map(select(. > 0)) | min // 5' "$CONFIG" 2>/dev/null || echo 5)"
[[ "$MIN_INTERVAL" =~ ^[0-9]+$ ]] && [ "$MIN_INTERVAL" -gt 0 ] || MIN_INTERVAL=5
CHECK_SECONDS=$((MIN_INTERVAL * 60))
# DEAD threshold multiple — matches master-loop-prompt.md step 0 ("more than 6×
# the role's loop interval"). A slow-but-alive role that legitimately goes >6×
# between heartbeats is protected by the per-role restart-loop guard below.
STALE_MULTIPLE=6

acquire_fleet_lock() {
  # Single fleet supervisor per repo. acquire_lock exits non-zero when the lock
  # is held by a live PID; swallow that and exit 0 so a duplicate launch is a
  # no-op (mirrors supervise.sh's acquire_supervisor_lock).
  if ! acquire_lock "$FLEET_LOCK_NAME" 2>/dev/null; then
    echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') Another fleet supervisor is already running. Exiting." >&2
    exit 0
  fi
}

# List shell-driver roles from PROJECT_CONFIG .loops (driver == "shell" only).
# Shell-driver roles carry their own supervise.sh inside the loop wrapper and are
# truly headless (claude via stdin per tick). The fleet watchdog ONLY restarts shell-driver
# roles — session-driver roles (driver == "session") are interactive Claude sessions
# that must not be auto-restarted. Restarting them kills in-memory cron state,
# loses context, and confuses the human operator.
# The supervisor never restarts interactive sessions — only headless shell-loop roles.
fleet_roles() {
  jq -r '.loops // {} | to_entries[] | select(.value.driver == "shell") | .key' "$CONFIG" 2>/dev/null || true
}

role_interval() {
  local role="$1" iv
  iv="$(jq -r --arg r "$role" '.loops[$r].intervalMinutes // 5' "$CONFIG" 2>/dev/null || echo 5)"
  [[ "$iv" =~ ^[0-9]+$ ]] && [ "$iv" -gt 0 ] || iv=5
  echo "$iv"
}

# Per-role crash-loop guard: 3+ restarts in 5 minutes → stop restarting this
# role and alert. Reuses the .restarts.jsonl ledger written by record_restart.
restart_loop_detected() {
  local role="$1"
  local restarts_file="${STATE_DIR}/${role}.restarts.jsonl"
  [ -f "$restarts_file" ] || return 1
  local now_epoch window_start count
  now_epoch=$(date +%s); window_start=$((now_epoch - 300))
  count=$(tail -n 10 "$restarts_file" 2>/dev/null | while IFS= read -r line; do
    ts=$(echo "$line" | jq -r '.restartAt // empty' 2>/dev/null)
    [ -z "$ts" ] && continue
    ep=$(date -d "$ts" +%s 2>/dev/null || echo 0)
    [ "$ep" -ge "$window_start" ] && echo 1
  done | wc -l)
  [ "$count" -ge 3 ]
}

record_restart() {
  local role="$1" ts
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$STATE_DIR"
  printf '{"restartAt":"%s","by":"fleet"}\n' "$ts" >> "${STATE_DIR}/${role}.restarts.jsonl"
}

alert() {
  local role="$1" kind="$2" msg="$3" ts
  ts="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  mkdir -p "$ALERTS_DIR"
  printf '%s %s\nDetected: %s\n%s\n' "$(echo "$role" | tr '[:lower:]' '[:upper:]')" "$kind" "$ts" "$msg" \
    > "${ALERTS_DIR}/${role}-${kind// /-}.txt"
}

# Re-create a DEAD role's tmux session, mirroring launch.md Step 5T:
#   new-session -d -c <worktree>  →  remain-on-exit on  →  send-keys <role cmd>
#   →  (after readiness) send-keys "/loop <interval>m <loop-prompt>"
recreate_session() {
  local role="$1" sess worktree interval loop_abs
  # CPT-975-AUDIT H5: sanitize role from config — keys may contain metacharacters
  local role_safe; role_safe=$(echo "$role" | tr -cd 'a-zA-Z0-9_-')
  sess="${PROJECT_SLUG}-${role_safe}"
  worktree="${REPO_ROOT}/.worktrees/${role}"
  interval="$(role_interval "$role")"
  # Use prompts/loops/ per new architecture (CPT-1013), not worktree copies
  loop_abs="${REPO_ROOT}/prompts/loops/${role}.md"

  [ -d "$worktree" ] || { echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: worktree missing ($worktree) — skip" >&2; return 1; }

  # Guard: only restart fleet sessions (<project>-<role>), never interactive (cl-*)
  if [[ ! "$sess" =~ ^[a-z][a-z0-9-]*-[a-z][a-z0-9_-]*$ ]]; then
    echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: session name '$sess' does not match fleet pattern — skip (not a headless session)" >&2
    return 1
  fi

  # --- CPT-1212: per-role provider + model (.sessions.<role> > .defaultProvider) ---
  local _role_provider _role_model
  _role_provider=$(jq -r --arg r "$role" '(.sessions[$r].provider // .defaultProvider // "anthropic")' "$CONFIG" 2>/dev/null || echo "anthropic")
  _role_model=$(jq -r --arg r "$role" '(.sessions[$r].model // "")' "$CONFIG" 2>/dev/null || echo "")

  # Validate provider exists in config — unknown provider skips with an alert
  # rather than recreating a session that cannot authenticate.
  if ! jq -e --arg p "$_role_provider" '(.providers // {}) | has($p)' "$CONFIG" >/dev/null 2>&1; then
    echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: unknown provider '$_role_provider' — skipping restart" >&2
    alert "$role" "UNKNOWN PROVIDER" "Provider '$_role_provider' is not in PROJECT_CONFIG.json .providers — fix the config; restart skipped."
    return 1
  fi
  local _model_env=""
  [[ -n "$_role_model" ]] && printf -v _model_env 'CLAUDE_MODEL=%q' "$_role_model"

  # Resolve the project's system prompt file (same convention as launch.md Step 5T
  # and cl-project). Without this, auto-restarted sessions lack host identity,
  # Jira access, and tool deferral rules. CPT-1212: per-role provider.
  # Security: validate PROJECT_NAME and the role's provider before constructing any
  # path or interpolating into a shell command. Use printf %q to escape the path.
  if [[ ! "$PROJECT_NAME" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
    echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: PROJECT_NAME '$PROJECT_NAME' contains unsafe characters — skipping system prompt" >&2
    SYSPROMPT=""
  else
    PROVIDER_UC=$(echo "$_role_provider" | tr '[:lower:]' '[:upper:]')
    if [[ ! "$PROVIDER_UC" =~ ^[A-Z][A-Z0-9_-]*$ ]]; then
      echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: provider '$_role_provider' invalid — skipping system prompt" >&2
      SYSPROMPT=""
    else
      # 1. Try per-role prompt first
      ROLE_PROMPT_PREFIX="prompts/${role}_SYSTEM_PROMPT_${PROVIDER_UC}_v"
      SYSPROMPT=$(ls "${REPO_ROOT}/${ROLE_PROMPT_PREFIX}"*.md 2>/dev/null | sort -V | tail -1)
      # 2. Fall back to shared repo-root prompt
      if [ -z "$SYSPROMPT" ]; then
        SP_PREFIX="${PROJECT_NAME}_SYSTEM_PROMPT_${PROVIDER_UC}_v"
        SYSPROMPT=$(ls "${REPO_ROOT}/${SP_PREFIX}"*.md 2>/dev/null | sort -V | tail -1)
      fi
      # Verify resolved path is within REPO_ROOT (path traversal guard)
      if [ -n "$SYSPROMPT" ] && [[ "$(readlink -f "$SYSPROMPT" 2>/dev/null || realpath "$SYSPROMPT" 2>/dev/null)" != "$REPO_ROOT"/* ]]; then
        echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: system prompt path traversal detected — skipping" >&2
        SYSPROMPT=""
      fi
    fi
  fi
  SYSPROMPT_FLAG=""
  if [ -n "$SYSPROMPT" ]; then
    printf -v SYSPROMPT_SAFE '%q' "$SYSPROMPT"
    SYSPROMPT_FLAG="--system-prompt-file $SYSPROMPT_SAFE"
  fi

  # Kill any lingering DEAD window (remain-on-exit leaves it visible but inert),
  # then create fresh. LOOP_KILL_COMMAND_BYPASS mirrors launch.md --force path.
  LOOP_KILL_COMMAND_BYPASS=1 tmux kill-session -t "$sess" 2>/dev/null || true

  TMUX_SESSION_CREATE_BYPASS=1 tmux new-session -d -s "$sess" -c "$worktree"
  tmux set-option -t "$sess" remain-on-exit on
  # CPT-1212: driver-correct recreate command with per-role provider (+ model
  # pin in env). Shell-driver roles get the loops-sh wrapper (self-looping);
  # session-driver roles get the interactive claude command + /loop injection.
  DRIVER=$(jq -r --arg r "$role" '.loops[$r].driver // "session"' "$CONFIG" 2>/dev/null || echo "session")
  if [ "$DRIVER" = "shell" ]; then
    tmux send-keys -t "$sess" "exec env ${_model_env:+$_model_env }CLAUDE_PROVIDER=$(printf '%q' "$_role_provider") CLAUDE_SYSTEM_PROMPT_FILE=${SYSPROMPT_SAFE:-} ${REPO_ROOT}/.claude/loops-sh/${role}.sh" Enter
  else
    # Interactive claude session — seed with project system prompt (host identity,
    # Jira, tool deferral). No stdin redirect — it breaks TTY detection.
    tmux send-keys -t "$sess" "${_model_env:+$_model_env }claude-with-provider.sh $(printf '%q' "$_role_provider") --dangerously-skip-permissions --permission-mode bypassPermissions --effort max $SYSPROMPT_FLAG" Enter
  fi

  # Re-inject the role prompt + loop once the TUI is ready (mirrors launch.md).
  # Shell-driver roles are self-looping — no injection needed.
  if [ "$DRIVER" != "shell" ]; then
    sleep 30
    if tmux has-session -t "$sess" 2>/dev/null; then
      # Inject role prompt via send-keys (preserves TTY stdin — no redirect)
      ROLE_PROMPT_FILE="${worktree}/${role}.sh"
      if [ -f "$ROLE_PROMPT_FILE" ]; then
        tmux send-keys -t "$sess" "$(cat "$ROLE_PROMPT_FILE")" Enter
        sleep 30
      fi
      [ -f "$loop_abs" ] && tmux send-keys -t "$sess" "/loop ${interval}m $loop_abs" Enter
    else
      echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: session died before /loop injection ($loop_abs) — restart will retry on next check" >&2
    fi
  fi
  echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: DEAD — recreated (provider=$_role_provider, model=${_role_model:-default}, driver=$DRIVER)." >&2
  record_restart "$role"
}

# Is a role DEAD? Missing heartbeat OR lastIteration older than 6× its interval.
role_is_dead() {
  local role="$1" hb interval last_iteration now_epoch heart_epoch age threshold
  hb="${STATE_DIR}/${role}.heartbeat.json"
  [ -f "$hb" ] || return 0
  last_iteration="$(jq -r '.lastIteration // empty' "$hb" 2>/dev/null)"
  [ -z "$last_iteration" ] && return 0
  interval="$(role_interval "$role")"
  now_epoch=$(date +%s)
  heart_epoch=$(date -d "$last_iteration" +%s 2>/dev/null || date -j -f '%Y-%m-%dT%H:%M:%SZ' "$last_iteration" +%s 2>/dev/null || echo 0)
  age=$((now_epoch - heart_epoch))
  threshold=$((STALE_MULTIPLE * interval * 60))
  [ "$age" -gt "$threshold" ]
}

# Does the tmux session for this role still exist? Two-check gate: a stale heartbeat
# alone is not enough to restart — the session must also be absent. If the session
# is still running but the heartbeat is stale, the role is slow/tardy, not dead.
# Restarting a live session creates an endless chain of same-role restarts.
role_session_running() {
  local role="$1" sess
  sess="${PROJECT_SLUG}-${role}"
  tmux has-session -t "$sess" 2>/dev/null
}

supervise() {
  # Early-exit: if no shell-driver roles exist, the watchdog has nothing to
  # monitor. Exit cleanly instead of looping forever holding the fleet lock.
  # Session-driver roles must NOT be auto-restarted — their cron state is
  # in-memory and a restart kills it.
  local role_count
  role_count=$(fleet_roles | grep -c . || true)
  if [ "${role_count:-0}" -eq 0 ]; then
    echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') No shell-driver roles configured — fleet watchdog exiting (session-driver roles are not auto-restarted)." >&2
    exit 0
  fi
  echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') Fleet supervisor started (project=$PROJECT_SLUG, check every ${CHECK_SECONDS}s, DEAD=${STALE_MULTIPLE}x interval, monitoring ${role_count} shell-driver role(s), per-role providers from PROJECT_CONFIG.json)." >&2
  # tmux is required for the restart action. Without it, detect-and-alert only.
  local have_tmux=1; command -v tmux >/dev/null 2>&1 || have_tmux=0
  while true; do
    sleep "$CHECK_SECONDS"
    local role
    while IFS= read -r role; do
      [ -z "$role" ] && continue
      role_is_dead "$role" || continue

      # Two-check gate: stale heartbeat alone is not enough — the tmux session
      # must also be absent. If the session is still running (slow tick, long
      # compute), killing it creates an endless chain of same-role restarts.
      if role_session_running "$role"; then
        echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: heartbeat stale but tmux session still alive — skipping restart (slow tick, not dead)." >&2
        continue
      fi

      if restart_loop_detected "$role"; then
        echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: RESTART LOOP (3+ in 5min) — not restarting; alerting." >&2
        alert "$role" "RESTART LOOP" "3+ fleet restarts within 5 minutes. Not restarting — manual intervention required."
        continue
      fi

      echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') $role: DEAD — recreating tmux session." >&2
      if [ "$have_tmux" -eq 1 ]; then
        recreate_session "$role" || alert "$role" "RESTART FAILED" "Fleet supervisor could not recreate the tmux session (see log)."
      else
        alert "$role" "LOOP DOWN" "Role DEAD and tmux is unavailable — cannot auto-restart. Manual intervention required."
      fi
    done < <(fleet_roles)
  done
}

acquire_fleet_lock
trap 'release_lock "$FLEET_LOCK_NAME" 2>/dev/null' EXIT

# CPT-1024: Pre-flight check — refuse to start if another fleet system is already
# managing this project. Double fleet concurrency causes 100+ Claude processes,
# ticket-claim races, heartbeat collisions, and host resource exhaustion.
preflight_fleet() {
  local tmux_count=0 claude_count=0
  # Count tmux sessions matching this project slug
  if command -v tmux >/dev/null 2>&1; then
    tmux_count=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -c "^${PROJECT_SLUG}-" || true)
  fi
  # Count Claude processes owned by this user
  claude_count=$(pgrep -c -u "$(whoami)" -f 'claude-with-provider\|/claude ' 2>/dev/null || true)
  if [ "$tmux_count" -gt 0 ] || [ "$claude_count" -gt 0 ]; then
    echo "[supervise-fleet] $(date -u +'%Y-%m-%dT%H:%M:%SZ') PRE-FLIGHT FAILED: ${tmux_count} tmux sessions + ${claude_count} Claude processes already running for project ${PROJECT_SLUG}. Another fleet system appears active — refusing to start. Stop the existing fleet first, then restart." >&2
    exit 1
  fi
}
preflight_fleet

supervise
