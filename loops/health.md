Current Singapore time: $(TZ=Asia/Singapore date)

# Health Loop

Recurring task: monitor session fleet health. Detect stale/dead sessions, escalate to Master.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key and the `.loops` block (role intervals).
- `git fetch --quiet origin`.
- Read `../../.claude/state/health.heartbeat.json` with the Read tool. If it exists, note the `lastIteration` timestamp and `startedAt`. If absent, note "first tick."

## Terminal-state guard (CPT-455)

Before any Jira transition, re-fetch the issue's current status and refuse to proceed if it has reached a terminal state (`Cancelled`, `Done`, `BACKLOG`).

## Do

1. **Read all heartbeat files.** For each role in `PROJECT_CONFIG.json` `.loops`:
   - Read `../../.claude/state/<role>.heartbeat.json`.
   - Compute staleness: `now - lastIteration` vs `3 × intervalMinutes`.
   - Classify: HEALTHY / STALE / DEAD (per thresholds in session prompt).

2. **Report fleet status.** Log a summary line per role with status classification.

3. **Escalate if needed.** For DEAD sessions:
   - Post a Jira comment on the project epic: "Health: <role> session appears DEAD — heartbeat absent or 3+ consecutive non-zero exits. Last seen: <timestamp>."
   - If a prior escalation comment already exists for this role within the last hour, do NOT duplicate it.

4. **Stale warnings.** For STALE sessions:
   - Log the warning locally but do NOT escalate to Jira unless stale for >2× the threshold (i.e., >6× intervalMinutes).

5. **CI health check.** Check CI status for the default branch (provider-specific — read `PROJECT_CONFIG.json` `.repo.provider`).

## Don't

- Don't modify source code — Health is read-only.
- Don't create branches or push commits.
- Don't escalate for sessions that are not declared in `.loops` (they may be event-driven).
- Don't spam Jira — one escalation per dead session per hour maximum.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/health.heartbeat.json`
- Content: `{"role":"health","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<preserved from read, or UTC now on first tick>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- Preserve `startedAt` from the heartbeat read at tick start. Set to current UTC time on first tick.
