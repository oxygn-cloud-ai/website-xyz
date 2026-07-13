Current Singapore time: $(TZ=Asia/Singapore date)

# Learner Loop

Recurring task: extract lessons from completed work. Propose improvements. Track patterns.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key.
- `git fetch --quiet origin`.
- Read `../../.claude/state/learner.heartbeat.json` with the Read tool. If it exists, note the `lastIteration` timestamp and `startedAt`. If absent, note "first tick."
- Read `../../.claude/state/learner.md` (state file) for previously processed tickets and accumulated patterns.

## Do

1. **Scan completed tickets.** Query Jira for `Done` issues under the project epic that were resolved since the last processed timestamp (from state file). If first tick, look at the last 10 Done tickets.

   ```bash
   curl -sS -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
     -G "${JIRA_URL}/rest/api/3/search/jql" \
     --data-urlencode 'jql=parent = <EPIC> AND status = Done ORDER BY updated DESC' \
     --data-urlencode 'fields=key,summary,status,issuetype,comment' \
     --data-urlencode 'maxResults=10'
   ```

2. **Extract patterns.** For each new ticket, look for:
   - Recurring bug categories (same root cause, same file area).
   - Repeated Reviewer feedback (same issue across multiple PRs).
   - Process friction (long rework cycles, blocked issues, stale plans).
   - Architecture signals (coupling, missing abstractions, test gaps).

3. **Propose improvements.** When a pattern appears 3+ times:
   - Create a Feature Request issue under the project epic with the improvement proposal.
   - Reference the source tickets in the description.

4. **Update state file.** Write the list of processed ticket keys and accumulated pattern counts to `../../.claude/state/learner.md`.

## Don't

- Don't modify source code — Learner is read-only.
- Don't create branches or push commits.
- Don't propose improvements based on a single occurrence — wait for patterns.
- Don't duplicate proposals that already exist as open tickets.

## Premise verification (before filing) — CPT-844

Before filing any audit / gap / bug / improvement ticket, re-verify EACH asserted codebase gap against **current `origin/main`** — not a prior audit, a stale local checkout, or memory. For each claimed gap: `git fetch origin` then confirm it against `origin/main` (`git show origin/main:<path>`, `git grep <pattern> origin/main`, or read the file at that ref). This is distinct from (and in addition to) the dedup step.

- **Cite the SHA:** record the `origin/main` SHA you verified against in the ticket description (e.g. `verified against origin/main <sha>`), so the Triager and downstream sessions can trust the premise.
- **Drop or downgrade resolved gaps:** if a gap is already closed on `origin/main`, do not file it. In a multi-AC ticket, remove the resolved ACs and set priority from the gaps that STILL EXIST — never let one real gap anchor already-resolved ACs at an inflated priority.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/learner.heartbeat.json`
- Content: `{"role":"learner","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<preserved from read, or UTC now on first tick>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- Preserve `startedAt` from the heartbeat read at tick start. Set to current UTC time on first tick.
