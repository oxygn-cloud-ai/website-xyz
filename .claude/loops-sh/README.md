# `.claude/loops-sh/` — loop driver scripts for polling roles

## What this is

Shared shell library (`_lib.sh`) and per-role wrapper scripts that provide heartbeat, checkpoint, lock, and state-handoff infrastructure for all loop-driven roles.

The default driver is `session` (CPT-654). Session-driven roles run `claude` interactively with `/loop N m <prompt>` injected at launch. The shell driver (`claude` stdin-piped headless) is available as an alternative for roles that benefit from cold-start iterations with no context accumulation.

## Driver comparison

| driver  | When to pick                                                  | What happens                                                                    |
|---------|---------------------------------------------------------------|----------------------------------------------------------------------------------|
| `session` | **(default)** All roles. Interactive TUI, warm context within a run. | iTerm2 tab with `claude` interactive + `/loop N m <prompt>`. |
| `shell` | Role with long-running unattended operation where context exhaustion is a concern. | `<project>-<role>-loop` tmux session runs `.claude/loops-sh/<role>.sh`. |
| `none`  | Role exists on disk but is not currently polling.             | `/project:launch` skips it. Equivalent to `intervalMinutes: 0`.                  |

`driver: "session"` is the settled default since CPT-654. All 10 loop-capable roles use it on origin/main. The `shell` driver remains available for projects that prefer the cold-start model.

## Files

```
.claude/loops-sh/
  _lib.sh        # Shared helpers: acquire_lock, release_lock, log, render_prompt, heartbeat
  master.sh      # Per-role wrappers for shell-driven roles (deployed only when driver=shell)
  triager.sh
  reviewer.sh
  versioner.sh
  chk1.sh
  chk2.sh
  fixer.sh
  implementer.sh
  README.md      # This file
```

Runtime artefacts (created on first run, not checked in):

```
.claude/locks/<role>.lock/          # atomic lock directory (mkdir-based — portable
                                    # across Linux + macOS; flock(1) is not
                                    # shipped with macOS)
.claude/locks/<role>.lock/pid       # current holder's PID (stale locks auto-cleared
                                    # via kill -0 when a fresh wrapper starts)
.claude/logs/<role>.log             # structured per-iteration log
.claude/state/<role>.md             # state handoff — the only durable memory
.claude/state/<role>.heartbeat.json # {role,lastIteration,lastExitCode,pid,startedAt} for /project:status
```

## State-handoff contract

`.claude/state/<role>.md` is the single source of handoff between iterations. Each loop prompt **must** instruct the model to read it on entry and overwrite it before exit.

```markdown
---
role: triager
lastIteration: 2026-04-17T02:15:00Z
iterationCount: 147
lastSeenJiraUpdate: 2026-04-17T02:12:03Z
lastSeenGitSha: 7386b42
---

## Open work

## Running notes
<free-form role-specific context the next iteration needs>
```

The loop prompt at `prompts/loops/<role>.md` gets the state-file path via the `{{STATE_FILE}}` placeholder, substituted by `render_prompt` in `_lib.sh`.

## Running a wrapper manually

```bash
./.claude/loops-sh/triager.sh        # runs in foreground; ^C to stop
```

The wrapper:

1. Reads `intervalMinutes` from `.loops.<role>.intervalMinutes` in `PROJECT_CONFIG.json`. If `0`, exits cleanly.
2. Acquires an atomic lock by `mkdir .claude/locks/<role>.lock`. If already held by a live PID, logs and exits with code 1 (AC #2); stale locks (holder dead) are auto-reclaimed.
3. Traps EXIT to release the lock (`rm -rf` the directory).
4. Enters `while true` — each iteration calls `run_iteration` (in `_lib.sh`):
   - Reads `.sessions.<role>.allowedTools` from `PROJECT_CONFIG.json` and passes it to `claude` via `--allowed-tools` (AC #8). Empty / missing list → flag omitted.
   - Invokes `claude --dangerously-skip-permissions --effort max --append-system-prompt <.claude/sessions/<role>.md> [--allowed-tools <list>] -p <rendered prompt>`.
   - Writes heartbeat JSON regardless of exit code.
   - Logs success or failure; the if/else branches never `exit` so the outer loop survives (AC #13).
5. Sleeps `intervalMinutes * 60` seconds between iterations.

`/project:launch` handles this automatically; manual invocation is for debugging.

## Debugging a stuck loop

```bash
# What's currently running?
cat .claude/locks/triager.lock/pid
ps -p "$(cat .claude/locks/triager.lock/pid)" -o pid,etime,command

# Recent iteration activity
tail -n 100 .claude/logs/triager.log

# Current heartbeat
cat .claude/state/triager.heartbeat.json | jq .
```

**Staleness detection:** `/project:status` flags a role as stale if its heartbeat is older than `3 × intervalMinutes`. That's usually the first signal that a loop has deadlocked on something network-side or gone into a tight-retry spiral.

**Common root causes:**

- `claude` CLI update changed a flag — check `claude --help` and the command the wrapper builds.
- `--append-system-prompt` file missing — fallback emits a minimal role string so the loop continues, but iterations won't have role identity.
- `jq` missing from `PATH` — install via `brew install jq` / `apt install jq`.
- Another holder has the lock directory — another tmux session, a crashed process whose PID got reused, or two `/project:launch` invocations racing. The wrapper auto-reclaims locks whose PID is dead (`kill -0` check) on the next start; if a live PID still holds, investigate with `ps -p`. `rm -rf .claude/locks/<role>.lock` is the manual escape hatch after you've verified no live holder.

## Permissions & tool scoping

`--dangerously-skip-permissions` is in use because the wrapper **is** the trust boundary. Per-role tool allowlisting is enforced via `--allowed-tools`, sourced from `.sessions.<role>.allowedTools` in `PROJECT_CONFIG.json` (AC #8). `run_iteration` in `_lib.sh` reads the list each iteration — changes to `PROJECT_CONFIG.json` take effect on the next iteration without restarting the wrapper.

Tool-name syntax follows claude's own conventions — see `claude --help` for `--allowed-tools`. Examples currently shipped in `PROJECT_CONFIG.json`:

| Role        | allowedTools (summary) |
|-------------|------------------------|
| triager     | Read, Grep, Glob, `Bash(git log:*)`, `Bash(git status:*)`, `Bash(git diff:*)`, `mcp__plugin_atlassian_atlassian__*` |
| reviewer    | Read, Grep, Glob, `Bash(git *)`, `mcp__plugin_atlassian_atlassian__*` |
| versioner   | Read, Write, Edit, Grep, Glob, `Bash(git *)`, `Bash(jq *)`, `Bash(curl *)`, `Bash(./scripts/generate-checksums.sh)`, `Bash(./scripts/validate-skills.sh)` |
| implementer | Read, Write, Edit, Grep, Glob, Bash, `mcp__plugin_atlassian_atlassian__*` |
| fixer       | Read, Write, Edit, Grep, Glob, Bash, `mcp__plugin_atlassian_atlassian__*` |
| chk1 / chk2 | Read, Grep, Glob, Bash, `mcp__plugin_atlassian_atlassian__*` |
| master      | Read, Grep, Glob, Bash, Edit, Write, `mcp__plugin_atlassian_atlassian__*` |

An empty list or missing key omits `--allowed-tools` entirely, falling back to claude's default allowlist. `scripts/validate-config.sh` emits a WARN for shell-driver roles missing an explicit list.

## Related

- Driver default: CPT-654 (all 10 roles → session, 2026-05-27).
- Config foundations: CPT-611 (loops-sh deploy), CPT-660 (driver: session cleanup).
- Open upstream issues on in-session context exhaustion: anthropics/claude-code#19877, #20267, #16659, #12665, #31220, #45627, #47861.
