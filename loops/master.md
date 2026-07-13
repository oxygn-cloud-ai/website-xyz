Current Singapore time: $(TZ=Asia/Singapore date)

# Master Loop

Recurring task: coordinate the multi-session workflow — CI health, Jira hygiene, release gates, and escalations.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key, role list, and loop intervals.
- Read `CLAUDE.md` and (if present) `ARCHITECTURE.md` for project specifics.
- `git fetch --quiet origin` so `main` and `session/*` refs are fresh.

## Do

0. **Session heartbeat check (every tick — P2-1, CPT-741).**
   - For each role in `PROJECT_CONFIG.json` `.sessions.roles`:
     Read `../<role>/.claude/state/<role>.heartbeat.json` (CPT-625/CPT-639: heartbeat files live in each role's own worktree; the Master loop's cwd is `.worktrees/master/`, so peer worktrees are one directory up at `../<role>/`).
   - **CPT-741 restart fields:** Also read `restartCount` (int, 0 on first ever start), `lastRestartAt` (ISO-8601), `lastRestartReason` (first-start|clean|crash|unknown). Use jq fallbacks: `.restartCount // 0`, `.lastRestartAt // empty`, `.lastRestartReason // empty`.
   - If `lastRestartAt` is within the last 2 minutes AND the session would otherwise be HEALTHY: classify **FRESH_RESTART** (do NOT flag DEAD — give it time for its first tick). Log as: `<role>: FRESH_RESTART (restart #<count>, <reason>, <N>s ago) — awaiting first tick`.
   - If the file is missing, or `lastIteration` is more than 6× the role's loop interval in the past: classify **DEAD**. Log and include in human summary.
   - If `lastIteration` is between 3× and 6× the interval: classify **STALE**. Log only (no Jira action).
   - Otherwise: classify **HEALTHY**.
   - **Do not mutate Jira state from heartbeat data alone.** State-timeout enforcement consumes this data after a ≥48h stabilisation period.

1. **CI status on `main`.** `gh run list --branch main --limit 5 --json conclusion,databaseId,headSha,displayTitle,createdAt,url`. If any run has `conclusion=failure` since last tick and no open `CI Issue` in the project epic references that run URL or SHA: file a new Jira task (Type: CI Issue, Priority: P1) with run URL, commit SHA, and the last 50 lines of the failed log. If a previously-failed CI-Issue's run has since recovered (`conclusion=success` for the same workflow on a later SHA), comment on the ticket and transition to Done.
2. **State timeout enforcement (P1-2 — escalation-only).**
   ALL actions are additive (tag + comment + transition to safer state). NEVER auto-triage, auto-approve, or auto-promote.

   - **Cancelled / Done / BACKLOG (terminal — CPT-455):** Master MUST NOT transition any issue OUT of these states. Master MUST NOT post "Reversing Cancellation" comments or similar policy overrides. Re-opening is a human-only action via the Jira UI; Master is not the sole authority and never the source of re-open authority. If Master detects work-in-progress (a pushed branch, an open feature/<KEY>-* branch on a session worktree, a scheduled task) tied to a ticket that has been cancelled mid-flight, Master COMMENTS on the ticket to escalate to the human (additive action only) — the human decides whether to re-open via the Jira UI. This rule is the explicit, loop-prompt-layer expression of MSA §11.2's "Master MUST never auto-promote any issue to a more-permissive state" — violating it directly enabled the CPT-449 19:58:06 "Reversing Cancellation" incident.

   - **Needs Triage:** >24h + no Triager activity → escalate to human. >48h: P1-P2 → tag `[STALE-TRIAGE]`, escalate again. P3-P4 → BACKLOG with rationale "auto-backlogged: triage timeout".

   - **In Progress:** >2h + HEALTHY heartbeat → comment "status check." >6h + HEALTHY + HEAD unchanged → tag `[LONG-RUNNING]`, no state change. >2h + DEAD heartbeat → comment "Unassigned — session inactive", transition to Blocked. Reset worktree ONLY IF `git status --porcelain` is clean (dirty → escalate, do NOT reset).

   - **In Review:** >4h → ping Reviewer. >12h → escalate to human. >24h → tag `[STALE-REVIEW]`, no state change.

   - **Changes Requested:** Labels `cycle:1`/`cycle:2`/`cycle:3`. 3rd occurrence → escalate with history, hard stop.

   - **BACKLOG:** >90d unreferenced → tag `[ABANDONED]`, notify human. No deletion.

   - **Blocked (new Jira status):** Master-entered or human-entered. Exit: human only.
3. **Worktree health.** `git worktree list --porcelain` + per-role `git -C .worktrees/<role> log -1 --format='%cr'`. Flag any role worktree whose HEAD hasn't moved in >24h while its Jira queue is non-empty.
4. **3-strikes escalations.** Search Jira for issues that have failed Reviewer or Versioner checks ≥3 times — escalate immediately with the full attempt history.
5. **Audit RC trigger emission (NEW).** Auditors (chk1, chk2, performance, playtester) run only when Master signals an RC via `refs/audit/<role>-rc-trigger`. Compute and push triggers as follows:
   - Stable-state gate: `In Progress` issue count under the epic must be `0` (don't churn auditors during active development).
   - `HEAD=$(git rev-parse origin/main)`.
   - For each role in `chk1 chk2 performance playtester`:
     ```
     LAST_SEEN=$(git show-ref --hash refs/audit/<role>-last-seen 2>/dev/null || echo "")
     CURRENT_TRIGGER=$(git show-ref --hash refs/audit/<role>-rc-trigger 2>/dev/null || echo "")
     if [[ "$HEAD" != "$LAST_SEEN" && "$HEAD" != "$CURRENT_TRIGGER" ]]; then
       git update-ref refs/audit/<role>-rc-trigger "$HEAD"
       git push origin refs/audit/<role>-rc-trigger
     fi
     ```
   - The playtester loop self-skips cleanly when no sandbox is configured on the auditor host (sandbox-precondition guard in `templates/playtester-loop-prompt.md`); Master can emit the trigger safely.
   - Do NOT push a trigger if the stable-state gate fails.

6. **Release-gate monitor (every tick — primary output).**

   Check all 5 gates against current `origin/main` HEAD. Report PASS/FAIL for each in every tick summary.

   **Gate 1 — Zero P1/P2 open:**
   Query Jira: `parent=CPT-3 AND priority in ("Highest","High") AND status not in ("Done","Cancelled","BACKLOG")`.
   FINDING status counts as open (requires Triager review). Count = 0 → PASS.

   **Gate 2 — PerformanceReviewer pass:**
   `git show-ref --hash refs/audit/performance-last-seen` must equal `git rev-parse origin/main`.
   If stale: emit RC trigger (step 5 handles emission). PASS only when last-seen = HEAD.

   **Gate 3 — Playtester regression pass:**
   `git show-ref --hash refs/audit/playtester-last-seen` must equal `git rev-parse origin/main`
   (or within 3 commits if HEAD moved after a fix-only patch). If no playtester-last-seen ref exists,
   use the `lastPlaytestSha` field in `PROJECT_CONFIG.json` if present, else FAIL.
   Playtester triggers defer to the human — flag when stale and request a sandbox run.

   **Gate 4 — CI green:**
   No open `issuetype="CI Issue"` tickets with status not Done/Cancelled/BACKLOG under the epic.
   Note: CI only runs on PRs in this project — gate passes if no tracked CI failures exist.

   **Gate 5 — No In Progress:**
   `parent=CPT-3 AND status="In Progress" AND issuetype != Task`. Count = 0 → PASS.
   (The CPT-270 tracking Task is excluded by the issuetype filter.)

   **If all gates PASS:** propose release candidate to human:
   > Release candidate: vX.Y.Z — N merges since last release, 0 P1/P2 open, CI green, PerformanceReviewer clear, Playtester clear. Cut release?
   Determine version: patch bump if all merged commits are `fix:`/`docs:`/`chore:`/`perf:`; minor bump if any `feat:` commit since last release tag.

   **If any gate FAILS:** do not propose RC. Instead output the **Session Priority Directive** (step 8).

7. **Branch audit (every 12th tick — P2-2, Phase 1: classification only).**
   Every 12th iteration:
   - Scan `origin/fix/CPT-*` and `origin/feature/CPT-*` branches: `git branch -r --list 'origin/fix/CPT-*' 'origin/feature/CPT-*'`
   - Extract all ticket keys upfront: `git branch -r --list 'origin/fix/CPT-*' 'origin/feature/CPT-*' | grep -oP 'CPT-\d+'`
   - Batch-fetch Jira statuses in a **single** JQL query (chunk at 200 keys if needed):
     `issueKey in (CPT-N1, CPT-N2, ...) ORDER BY key ASC` via `/rest/api/3/search/jql`
   - Build a local status map `{ "CPT-N": "<status>", ... }` from the response. Zero additional Jira calls.
   - Classify each branch from the local map + last-commit age: ACTIVE (<24h), STALE (24h-7d), ORPHANED (>7d + Jira terminal).
   - Log to `.claude/logs/branch-audit.log`. Include in human report.
   - ORPHANED: comment on linked Jira. **No automatic deletion.**

8. **Session priority directive (every tick when RC gates are failing).**

   After completing steps 0-7, synthesise the gate failures into explicit per-role guidance. Output this as the final section of every tick summary. The goal: every active session knows exactly what to do next to advance the RC.

   **Compute priority order:**
   - P1 open issues always head the list (e.g., CPT-410 self-merge adoption).
   - Then P2 issues, ordered: In Review (unblock Reviewer) > Changes Requested (unblock Fixer/Implementer rework) > In Progress (watch for staleness) > Ready for Coding (queue for pickup).
   - Then gate 2/3 unblock actions (PerformanceReviewer / Playtester runs).

   **Output format:**
   ```
   ## Session Priority Directive
   RC gates failing: <list which gates>
   Blocking P1: <ticket> — <one-line action>
   Blocking P2: <ticket list with status>
   Reviewer: review <ticket(s) in In Review>
   Implementer: pick up <highest RFC ticket> next
   Fixer: rework <Changes Requested ticket> — <specific action>
   PerformanceReviewer: trigger at <SHA> — awaiting session activation
   Playtester: [needs sandbox run on <HEAD> / last run was <SHA> N commits behind]
   ```

   Omit any role with nothing actionable. Keep each line to one sentence.
   This directive replaces ad-hoc escalation text — every tick ends with it.

9. **Fleet-watchdog liveness (every tick — CPT-840, who-watches-the-watcher).** The fleet watchdog `supervise-fleet.sh` auto-restarts DEAD session-driver roles; if it dies, the whole fleet loses auto-restart coverage. Verify it is alive and re-launch it if not:
   - Read `.claude/locks/fleet-supervisor.lock/pid` (relative to the repo root — Master's cwd is `.worktrees/master/`, so the repo-root lock is at `../../.claude/locks/fleet-supervisor.lock/pid`). If the lock dir is missing, OR the holder PID is not alive (`kill -0 <pid>` fails), the fleet watchdog is DOWN.
   - If DOWN and the tmux backend is in use: re-launch it with `nohup ../../.claude/loops-sh/supervise-fleet.sh > /dev/null 2>&1 &`. The script self-guards via the same lock, so a redundant relaunch is a harmless no-op. Log as `fleet-watchdog: RELAUNCHED (was DOWN)`.
   - If the script file is absent (`../../.claude/loops-sh/supervise-fleet.sh` not executable), log `fleet-watchdog: MISSING — run install.sh --sync-loops` and include it in the human summary. Do NOT attempt to author it (Master is coordination-only).

## Don't

- Don't write code. Master is documentation/config/coordination only.
- Don't file triage-stage issues — that's the Triager's gate.
- Don't merge — Fixer/Implementer self-merge; Versioner handles post-merge versioning.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/master.heartbeat.json`
- Content: `{"role":"master","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<current UTC now — this instance start>","restartCount":<preserved from read, incremented on restart>,"lastRestartAt":"<preserved from read, or UTC now on restart>","lastRestartReason":"<preserved from read: first-start|clean|crash|unknown>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- **On first tick:** read existing heartbeat with the Read tool. If absent, this is first-start (restartCount=0, lastRestartReason="first-start", startedAt=current UTC).
- **Restart detection (CPT-741):** if `.pid` in the existing heartbeat differs from current PID (check with `echo $$`), this is a restart — increment restartCount, set lastRestartAt to now, derive lastRestartReason from prior lastExitCode (0→clean, non-zero→crash).
- **Same instance:** preserve restartCount, lastRestartAt, lastRestartReason from read. Update startedAt to current UTC time.
- **Backward compatibility (CPT-741):** all new fields tolerate absence — use `jq -r '.restartCount // 0'` and `jq -r '.lastRestartAt // empty'` pattern. No migration needed.

## Reference

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/MULTI_SESSION_ARCHITECTURE.md` §2 for the full Master protocol, §4 for release gates, §11 for escalation rules.
