#!/usr/bin/env bash
# .claude/loops-sh/_lib.sh — shared helpers for shell-loop wrappers.
# Each role wrapper sources this via `source "$(dirname "$0")/_lib.sh"` and
# uses acquire_lock / release_lock / log / render_prompt / heartbeat.
#
# Wrappers are sourced *and* executed; the library itself is marked executable
# only so the bats scaffold check (`-x _lib.sh`) passes — it is not meant to
# be run directly. Running it is a harmless no-op.

set -euo pipefail

# shellcheck disable=SC2034
# PROJECT_CONFIG / PROJECT_ROOT / LOCK_DIR / LOG_DIR / STATE_DIR are exported to
# the sourcing wrapper (module-style public vars); shellcheck flags them as
# unused because it lints this file in isolation.
_LOOPS_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$_LOOPS_SH_DIR/../.." && pwd)"
PROJECT_CONFIG="$PROJECT_ROOT/PROJECT_CONFIG.json"
LOCK_DIR="${LOCK_DIR:-$PROJECT_ROOT/.claude/locks}"
LOG_DIR="${LOG_DIR:-$PROJECT_ROOT/.claude/logs}"
STATE_DIR="${STATE_DIR:-$PROJECT_ROOT/.claude/state}"
export PROJECT_ROOT PROJECT_CONFIG LOCK_DIR LOG_DIR STATE_DIR
mkdir -p "$LOCK_DIR" "$LOG_DIR" "$STATE_DIR"

# log — structured stderr + per-role file log. Always prefixes with ISO-8601 UTC.
# Usage: log <role> <message…>
log() {
  local role="${1:-unknown}"; shift || true
  local ts=""
  TZ=UTC printf -v ts '%(%Y-%m-%dT%H:%M:%SZ)T' -1
  local line="[$ts] [$role] $*"
  printf '%s\n' "$line" >&2
  printf '%s\n' "$line" >> "$LOG_DIR/$role.log"
  # Rotate log: keep last 1000 lines to prevent unbounded growth
  if [ -f "$LOG_DIR/$role.log" ] && [ $(wc -l < "$LOG_DIR/$role.log") -gt 1000 ]; then
    tail -n 1000 "$LOG_DIR/$role.log" > "$LOG_DIR/$role.log.tmp" && mv "$LOG_DIR/$role.log.tmp" "$LOG_DIR/$role.log"
  fi
}

# acquire_lock — atomic single-holder lock via mkdir (AC #2).
# mkdir is atomic across Linux and macOS and requires no external deps (flock(1)
# is not shipped with macOS; fleet runs on Darwin). Holder PID lives in
# <lockdir>/pid so stale locks (previous holder died without releasing) are
# detected via kill -0 and reclaimed automatically.
# Exits 1 with a log line if a live holder already owns the lock.
# Usage: acquire_lock <role>
acquire_lock() {
  local role="$1"
  local lockdir="$LOCK_DIR/$role.lock"
  if ! mkdir "$lockdir" 2>/dev/null; then
    local holder_pid
    holder_pid="$(cat "$lockdir/pid" 2>/dev/null || true)"
    if [[ -n "$holder_pid" ]] && kill -0 "$holder_pid" 2>/dev/null; then
      if [[ "${LIVE_LOCK_RECONNECT:-}" = "1" ]]; then
        log "$role" "live lock holder PID $holder_pid — reconnecting"
        echo "[$role] Already running (PID $holder_pid). Reconnecting..."
        if [ -t 1 ]; then
          echo "Tailing log: $LOG_DIR/${role}.log"
          exec tail -f "$LOG_DIR/${role}.log"
        fi
        echo "Tailing log: $LOG_DIR/${role}.log"
        exit 0
      fi
      log "$role" "lock held by live PID $holder_pid — refusing to start"
      exit 1
    fi
    rm -rf "$lockdir"
    if ! mkdir "$lockdir" 2>/dev/null; then
      log "$role" "lock held — refusing to start (race reclaiming stale lock)"
      exit 1
    fi
    log "$role" "reclaimed stale lock from dead PID ${holder_pid:-unknown}"
  fi
  echo "$$" > "$lockdir/pid"
}

# release_lock — remove the lock directory. Trap EXIT wires this.
# Safe to call when no lock is held.
# Usage: release_lock <role>
release_lock() {
  local role="$1"
  rm -rf "$LOCK_DIR/$role.lock" 2>/dev/null || true
}

# render_prompt — produce the prompt string passed to `claude` via stdin.
# Prepends a state-handoff preamble (the state file is the only durable memory
# between shell-driver iterations — AC #4/#5) and substitutes {{STATE_FILE}} /
# {{ROLE}} placeholders in the role's loop prompt. If the prompt file already
# contains an explicit state-handoff section, the preamble still fires — it is
# idempotent guidance, not harmful duplication.
# Usage: render_prompt <prompt-file> <state-file>
# local_time — produce a human-readable local date/time string for the preamble.
# Uses python3 for portable formatting across Linux, macOS, and WSL.
# Format: "Singapore, Fri 22 May 2026, 7:33am"
_local_time() {
  python3 -c "
import datetime, os, re
now = datetime.datetime.now()
h = now.strftime('%I').lstrip('0')
m = now.strftime('%M')
ap = now.strftime('%p').lower()
# Try to get a friendly city name from the timezone
tz = ''
try:
    if os.path.exists('/etc/timezone'):
        with open('/etc/timezone') as f:
            tz = f.read().strip().split('/')[-1].replace('_', ' ')
    if not tz or tz == 'UTC':
        import subprocess
        r = subprocess.run(['systemsetup','-gettimezone'], capture_output=True, text=True)
        if r.returncode == 0:
            tz = r.stdout.split(': ')[-1].strip().split('/')[-1].replace('_', ' ')
except Exception:
    pass
if not tz or tz in ('GMT', 'local'):
    tz = now.strftime('%Z')
if not tz:
    tz = 'UTC'
weekday = now.strftime('%a')
month = now.strftime('%b')
day = now.strftime('%d')
year = now.strftime('%Y')
print(f'{tz}, {weekday} {day} {month} {year}, {h}:{m}{ap}')
"
}

render_prompt() {
  local prompt_file="$1"
  local state_file="$2"
  local content="" local_now=""
  local_now="$(_local_time)"
  content=$(<"$prompt_file")
  content="${content//\{\{STATE_FILE\}\}/$state_file}"
  content="${content//\{\{ROLE\}\}/${ROLE:-unknown}}"
  cat <<EOF
# Loop tick — $local_now

You are running under the shell-loop driver. Each iteration is a **fresh**
\`claude\` (stdin-piped) process with no memory of prior iterations. The state file at
\`$state_file\` is the only durable memory between iterations.

**On entry — state the time:** begin your response with the local time
(e.g. "$local_now") so the human can see when this tick fired.

**On entry — read state:** read \`$state_file\`. If it does not exist, this is
the first iteration — treat state as empty and continue.

**On exit:** before you finish, overwrite \`$state_file\` with a fresh handoff
that the next iteration needs (open work, last-seen git SHA, last-seen Jira
update timestamp, running notes). Keep it concise — future iterations pay for
every byte.

---

$content
EOF
}

# record_restart — append a restart event to the JSONL restart log and return
# the restart number and reason for use by heartbeat(). Called once before the
# while-true loop in every shell-loop wrapper, and by the SessionStart hook for
# session-driven roles (CPT-741).
# Usage: record_restart <role> <reason>
#   reason is one of: first-start | clean | crash | unknown
#   If omitted, reason is auto-detected from prior heartbeat state.
record_restart() {
  local role="$1"
  local reason="${2:-}"
  local ts="" restart_number=0 prior_pid=""

  TZ=UTC printf -v ts '%(%Y-%m-%dT%H:%M:%SZ)T' -1

  # Auto-detect reason if not provided
  if [ -z "$reason" ]; then
    if [ ! -f "$STATE_DIR/$role.heartbeat.json" ]; then
      reason="first-start"
    else
      local prior_exit
      prior_exit="$(jq -r '.lastExitCode // 0' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
      if [ "$prior_exit" != "0" ]; then
        reason="crash"
      else
        reason="clean"
      fi
    fi
  fi

  # Determine restart number from JSONL count
  local jsonl="$STATE_DIR/$role.restarts.jsonl"
  if [ -f "$jsonl" ]; then
    restart_number="$(wc -l < "$jsonl" | tr -d ' ')"
  fi

  # Capture prior pid from existing heartbeat if present
  if [ -f "$STATE_DIR/$role.heartbeat.json" ]; then
    prior_pid="$(jq -r '.pid // empty' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
  fi

  # Append JSONL line
  mkdir -p "$STATE_DIR"
  if [ -f "$jsonl" ] && [ ! -s "$jsonl" ]; then
    : # empty file — no trailing newline needed
  fi
  cat >> "$jsonl" <<EOF
{"restartAt":"$ts","priorPid":"$prior_pid","restartReason":"$reason","restartNumber":$restart_number}
EOF

}

# heartbeat — record iteration completion for /project:status staleness detection
# and Master session-health monitoring (CPT-3, P2-1).
# Writes JSON to .claude/state/<role>.heartbeat.json each iteration.
# Schema: role, lastIteration, lastExitCode, pid, startedAt, restartCount,
# lastRestartAt, lastRestartReason (CPT-741 extends original CPT-3 schema).
# Usage: heartbeat <role> <exit-code>
# jira_reachable — test Jira API connectivity before main loop body.
# Returns 0 if Jira responds within 5s, 1 if unreachable.
# Prevents restart storms during Jira outages (CPT-1137).
jira_reachable() {

# adaptive_sleep — sleep with exponential backoff for idle ticks (CPT-1138).
# Usage: adaptive_sleep <base_interval_minutes> <idle_count>
# After 3+ consecutive idle ticks, double the sleep time, capped at 60min.
adaptive_sleep() {
  local base_min="$1" idle="${2:-0}" sleep_min="$base_min"
  if [ "$idle" -ge 3 ]; then sleep_min=$((base_min * 2))
  elif [ "$idle" -ge 6 ]; then sleep_min=$((base_min * 4))
  elif [ "$idle" -ge 9 ]; then sleep_min=$((base_min * 8)); fi
  [ "$sleep_min" -gt 60 ] && sleep_min=60
  sleep $((sleep_min * 60))
}

  local jira_url="${JIRA_URL:-https://chocfin.atlassian.net}"
  curl -sS --max-time 5 -o /dev/null -u "${JIRA_EMAIL:-}:${JIRA_API_KEY:-}" \
    "${jira_url}/rest/api/3/myself" 2>/dev/null && return 0 || return 1
}

heartbeat() {
  local role="$1"
  local exit_code="${2:-0}"
  local ts="" started_at="" restart_count=0 last_restart_at="" last_restart_reason="first-start"
  TZ=UTC printf -v ts '%(%Y-%m-%dT%H:%M:%SZ)T' -1

  # Default startedAt to NOW — overridden in the same-instance branch below.
  started_at="$ts"

  # Load prior singleton state if it exists
  if [ -f "$STATE_DIR/$role.heartbeat.json" ]; then
    local prior_pid prior_restart_count prior_restart_at prior_restart_reason prior_started_at
    prior_pid="$(jq -r '.pid // empty' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
    prior_restart_count="$(jq -r '.restartCount // 0' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
    prior_restart_at="$(jq -r '.lastRestartAt // empty' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
    prior_restart_reason="$(jq -r '.lastRestartReason // empty' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
    prior_started_at="$(jq -r '.startedAt // empty' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"

    # Detect restart: pid changed (or prior pid is dead)
    if [ -n "$prior_pid" ] && [ "$prior_pid" != "$$" ]; then
      # New instance — startedAt resets to NOW (already set above)
      restart_count=$((prior_restart_count + 1))
      last_restart_at="$ts"
      # Reason from prior heartbeat exit code
      local prior_exit
      prior_exit="$(jq -r '.lastExitCode // 0' "$STATE_DIR/$role.heartbeat.json" 2>/dev/null)"
      if [ "$prior_exit" != "0" ]; then
        last_restart_reason="crash"
      else
        last_restart_reason="clean"
      fi
    else
      # Same instance — preserve prior values including startedAt
      started_at="${prior_started_at:-$ts}"
      restart_count="${prior_restart_count:-0}"
      last_restart_at="${prior_restart_at:-$ts}"
      last_restart_reason="${prior_restart_reason:-first-start}"
    fi
  else
    # First heartbeat ever for this role
    restart_count=0
    last_restart_at="$ts"
    last_restart_reason="first-start"
  fi

  cat > "$STATE_DIR/$role.heartbeat.json" <<EOF
{
  "tickStartedAt": "${TICK_STARTED_AT:-$ts}",
  "role": "$role",
  "lastIteration": "$ts",
  "lastExitCode": $exit_code,
  "pid": $$,
  "startedAt": "$started_at",
  "restartCount": $restart_count,
  "lastRestartAt": "$last_restart_at",
  "lastRestartReason": "$last_restart_reason"
}
EOF
}

# ——— P2-4: Crash Recovery Checkpoints ———

# write_checkpoint — persist minimal resumable state after each iteration.
# Used by Fixer and Implementer so a crash mid-work can be recovered.
# Schema: role, ticket, branch, phase, head_sha, dirty, last_iteration.
# Usage: write_checkpoint <role> <ticket> <branch> <phase>
write_checkpoint() {
  local role="$1" ticket="$2" branch="$3" phase="$4"

  # Guard: STATE_DIR must be set (initialised at _lib.sh source time, line 21;
  # defanged here to survive misuse in non-standard environments)
  if [ -z "${STATE_DIR:-}" ]; then
    echo "[write_checkpoint] ERROR: STATE_DIR not set — cannot write checkpoint" >&2
    return 1
  fi

  local ts="" head_sha dirty tmpfile
  TZ=UTC printf -v ts '%(%Y-%m-%dT%H:%M:%SZ)T' -1
  head_sha="$(git rev-parse HEAD 2>/dev/null || echo "unknown")"
  dirty=false
  # git status --porcelain returns empty when clean; non-empty → dirty
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    dirty=true
  fi

  # Atomic write: temp file then mv. Prevents partial JSON on crash.
  tmpfile="${STATE_DIR}/${role}-checkpoint.tmp.$$"
  cat > "$tmpfile" <<EOF
{
  "role": "$role",
  "ticket": "$ticket",
  "branch": "$branch",
  "phase": "$phase",
  "head_sha": "$head_sha",
  "dirty": $dirty,
  "last_iteration": "$ts"
}
EOF
  mv "$tmpfile" "${STATE_DIR}/${role}-checkpoint.json"
}

# read_checkpoint — read a saved checkpoint, or return empty if none/expired.
# Usage: read_checkpoint <role>
read_checkpoint() {
  local role="$1" f="$STATE_DIR/${role}-checkpoint.json"
  [ -f "$f" ] || return 1
  cat "$f"
}

# archive_checkpoint — rename checkpoint after recovery so human can inspect.
# Usage: archive_checkpoint <role>
archive_checkpoint() {
  local role="$1" f="$STATE_DIR/${role}-checkpoint.json"
  local ts=""
  TZ=UTC printf -v ts '%(%Y%m%dT%H%M%SZ)T' -1
  [ -f "$f" ] && mv "$f" "${STATE_DIR}/${role}-checkpoint-recovered-${ts}.json"
}

# ———

# run_with_timeout — execute a command with a wall-clock deadline (CPT-554).
# Uses SIGTERM first; if still alive after 10s grace, follows with SIGKILL.
# Returns 124 on timeout, otherwise the wrapped command's exit code.
# Portable: works on both Linux and macOS (no coreutils timeout dependency).
run_with_timeout() {
  local deadline_secs="$1"
  shift
  if [[ "$deadline_secs" -le 0 ]]; then
    "$@"; return $?
  fi
  "$@" & local cmd_pid=$!; local slept=0 step=5
  while [[ "$slept" -lt "$deadline_secs" ]]; do
    sleep "$step"; slept=$((slept + step))
    if ! kill -0 "$cmd_pid" 2>/dev/null; then wait "$cmd_pid"; return $?; fi
  done
  kill -TERM "$cmd_pid" 2>/dev/null || true; slept=0
  while [[ "$slept" -lt 10 ]]; do
    sleep 1; slept=$((slept + 1))
    if ! kill -0 "$cmd_pid" 2>/dev/null; then wait "$cmd_pid"; return 124; fi
  done
  kill -KILL "$cmd_pid" 2>/dev/null || true; wait "$cmd_pid" 2>/dev/null || true; return 124
}

# run_iteration — invoke `claude` (stdin-piped) for one polling iteration (AC #8).
# Reads the role's allowlist from .sessions.<role>.allowedTools in PROJECT_CONFIG
# and passes it to claude via --allowed-tools. When the list is empty or missing,
# the flag is omitted (claude falls back to its default allowlist).
# CPT-1212: provider resolution order is $CLAUDE_PROVIDER (env override) >
# .sessions.<role>.provider > .defaultProvider > anthropic; per-role model pins
# (.sessions.<role>.model) reach the routing layer via CLAUDE_MODEL when the
# launcher/watchdog hasn't already set it. Routes through
# claude-with-provider.sh so env vars (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN /
# ANTHROPIC_API_KEY, model aliases, effort) are set correctly for every iteration.
# Returns claude's exit code so the wrapper's if/else can record success/failure.
# Usage: run_iteration <role> <prompt-file> <state-file> <session-prompt-file>
run_iteration() {
  local role="$1" prompt_file="$2" state_file="$3" session_prompt_file="$4"
  local sys_prompt rendered allowed provider
  sys_prompt="$(cat "$session_prompt_file" 2>/dev/null || printf 'Role: %s' "$role")"
  rendered="$(render_prompt "$prompt_file" "$state_file")"
  local _jq_out=""
  # CPT-1212: ONE jq fork (CPT-333 fork budget) resolves everything —
  # allowlist, provider (env > session > default), model pin, timeout,
  # the valid-provider list, and a validity flag. Provider resolution
  # order: $CLAUDE_PROVIDER env override > .sessions.<role>.provider >
  # .defaultProvider > anthropic.
  _jq_out="$(jq -r --arg r "$role" --arg envp "${CLAUDE_PROVIDER:-}" '
    (.providers // {}) as $provs
    | (.sessions[$r].provider // "") as $sp
    | (if $envp != "" then $envp elif $sp != "" then $sp else (.defaultProvider // "anthropic") end) as $resolved
    | (.sessions[$r].allowedTools // [] | join(",")),
      $resolved,
      (.sessions[$r].model // ""),
      (.defaultProvider // "anthropic"),
      (if (.loops[$r].timeoutMinutes // null) then .loops[$r].timeoutMinutes elif (.loops[$r].intervalMinutes // null) then (.loops[$r].intervalMinutes * 3) else 5 end | tostring),
      ($provs | keys | join(", ")),
      (if ($provs | length == 0) or ($provs | has($resolved)) then "ok" else "invalid" end)
  ' "$PROJECT_CONFIG" 2>/dev/null || true)"
  mapfile -t _lines <<< "$_jq_out"
  allowed="${_lines[0]}"
  provider="${_lines[1]:-anthropic}"

  # --- CPT-1212: per-role model resolution ---
  # CLAUDE_MODEL env (launcher/watchdog) wins; session config fills the gap;
  # otherwise claude-with-provider.sh uses the provider's defaultModel.
  if [[ -z "${CLAUDE_MODEL:-}" && -n "${_lines[2]:-}" ]]; then
    export CLAUDE_MODEL="${_lines[2]}"
  fi

  # Validity was computed inside the single jq fork (CPT-333 fork budget).
  if [[ "${_lines[6]:-ok}" == "invalid" ]]; then
    log "$role" "FATAL: unknown provider '$provider'. Valid: ${_lines[5]:-anthropic} — using anthropic fallback"
    provider="anthropic"
  fi

  log "$role" "tick provider=$provider model=${CLAUDE_MODEL:-unset} timeout=${_lines[4]:-15}m"
  export CLAUDE_RUNTIME_SESSION_NAME="${role}"
  # CPT-798: suppress the interactive bypass-permissions warning prompt in headless sessions
  export IS_SANDBOX=1
  local args=(--dangerously-skip-permissions --permission-mode bypassPermissions --effort max --append-system-prompt "$sys_prompt")
  # Inject the project system prompt (host identity, Jira access, tool deferral)
  # if set by the launcher. Without this, shell-driven roles run with Claude Code's
  # built-in default system prompt — no machine context.
  [[ -n "${CLAUDE_SYSTEM_PROMPT_FILE:-}" ]] && args+=(--system-prompt-file "$CLAUDE_SYSTEM_PROMPT_FILE")
        if [[ -n "$allowed" ]]; then
          args+=(--allowed-tools "$allowed")
        else
          args+=(--allowed-tools "Read,Write,Edit,Grep,Glob,Bash,TaskCreate,TaskUpdate,WebFetch,WebSearch")
        fi
  local timeout_minutes
  if [[ -n "${LOOP_TIMEOUT_MINUTES:-}" ]]; then
    timeout_minutes="$LOOP_TIMEOUT_MINUTES"
  else
    timeout_minutes="${_lines[4]:-15}"
  fi
  [[ "$timeout_minutes" =~ ^[0-9]+$ ]] || timeout_minutes=15
  local timeout_seconds=$((timeout_minutes * 60))
  printf '%s' "$rendered" | run_with_timeout "$timeout_seconds" env CHOC_SKILLS_PATH="$PROJECT_ROOT" claude-with-provider.sh "$provider" "${args[@]}"
}
