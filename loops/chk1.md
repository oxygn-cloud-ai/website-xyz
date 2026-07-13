Current Singapore time: $(TZ=Asia/Singapore date)

# chk1 Auditor Loop

Recurring task: run `/chk1:all` against `origin/feature/*` and `origin/fix/*` branches with new commits and file findings as Jira tasks under the project's epic with severity-gated routing. **Continuous interval-gated scanning — every tick, not RC-cadence.** Never write code.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key.
- **Fetch all branches** — continuous scanning needs current refs for all feature/fix branches:
  ```
  git fetch origin --quiet
  ```
- **Discover active branches:**
  ```
  git ls-remote origin 'refs/heads/feature/*' 'refs/heads/fix/*'
  ```
- **Load scan state** from `../../.claude/state/chk1-scan-state.json`. If absent, initialise with empty branches map.

## Cadence — continuous, interval-gated (NOT RC-cadence)

- **Every tick:** scan ALL `origin/feature/*` and `origin/fix/*` branches for new commits since per-branch `lastSeenSha` in the scan state.
- **No branches with new commits:** idle tick. Set `../../.claude/state/chk1.next-interval` to `30` (30 minutes). Stop this tick.
- **Branches detected with new commits:** set `../../.claude/state/chk1.next-interval` to `10` (10 minutes). For each branch, diff `<lastSeenSha>..<HEAD>` and run `/chk1:all` against it. Update per-branch `lastSeenSha` after scanning.
- **First scan for a branch** (no prior `lastSeenSha`): baseline the current HEAD as lastSeenSha without auditing. New branches are not retroactively audited — only new commits on subsequent ticks trigger scanning.

## Do

1. **Audit.** For each branch with new commits, run `/chk1:all` against the diff range `lastSeenSha..HEAD`. Capture every finding with file, line, rule id, severity (P1–P4), suggested fix.

2. **Per-tick filing budget (mandatory).** A maximum of **3 findings** may be filed per tick. Track a `findingsFiled` counter during the tick. Excess findings (those beyond 3) MUST be counted in the scan state `findingsSuppressed` counter (increment by the number of excess findings). The `findingsSuppressed` counter is cumulative across ticks — it proves suppressed findings were not silently dropped. Log suppressed findings to `.claude/logs/chk1-suppressed.log`:
   ```
   mkdir -p .claude/logs
   echo "<ISO-8601 timestamp>  <file>:<line>  rule_id=<rule>  severity=<P1-P4>  branch=<branch>  reason=budget-cap" >> .claude/logs/chk1-suppressed.log
   ```

3. **Per-finding severity gate (mandatory).** Apply BEFORE filing:
   - P1/P2 → file as ticket, then transition to **FINDING (transition id 48)** for human/Triager review.
   - P3/P4 → file as ticket, then transition to **BACKLOG (transition id 47) DIRECTLY**, with the burden-of-proof first comment (see step 5).

4. **Saturation throttle (run BEFORE filing).** For each prospective finding:
   ```
   JQL: parent=<EPIC> AND issuetype="Code Quality" AND statusCategory != Done AND text ~ "<file_path>"
   ```
   If `≥3` open results exist for this `(issuetype, file)` pair: suppress this finding and comment `<file>:<line> — <one-line summary>` on the most-recently-updated matching ticket. Don't compound.

5. **Pre-merge dedup against Reviewer comments (CPT-444).** For each prospective finding `(file, line)` that survived the saturation throttle:

   - **Cross-branch finding carve-out (skip dedup).** If the finding's file path was NOT changed by any branch in the audit range — i.e. the file is untouched in this branch's diff — DO NOT apply pre-merge dedup; fall through to step 6. This preserves the chk1 session's unique value at the integration / cross-branch layer.
     ```
     git diff --name-only "$LAST_SEEN_SHA" "$HEAD_SHA" | grep -qxF "<file>" || skip_dedup=1
     ```

   - **(a) Resolve merged CPT keys in the audit range.** Extract from commit messages (regex `CPT-[0-9]+`) and from branch names matching `fix/<KEY>` or `feature/<KEY>`:
     ```
     git log --format='%s%n%b' "$LAST_SEEN_SHA".."$HEAD_SHA" | grep -oE 'CPT-[0-9]+' | sort -u
     ```

   - **(b) Fetch comments for each candidate ticket**, bounded:
     ```
     GET ${JIRA_URL}/rest/api/3/issue/<KEY>/comment?maxResults=50&orderBy=-created
     ```
     Basic auth `${JIRA_EMAIL}:${JIRA_API_KEY}`. The 50-most-recent bound keeps tick latency predictable on saturated tickets (e.g. tickets with 100+ comments) — pre-merge Reviewer comments and the chk1-rc-redetection self-comments both land in the most-recent slice, so older comments do not need fetching. If a future ticket needs deeper history, raise the bound deliberately.

   - **(c) Literal-string search the comment bodies** for `<file>:<line>` first (exact match), then `<file>` (file-only fallback when line drift is suspected).

   - **(d) On match — idempotency check first.** If the matched ticket already has a comment containing the literal string `chk1-rc-redetection: <file>:<line>`, suppress this filing silently — do not add a second re-detection comment. Otherwise suppress the filing and post ONE comment on the matched ticket of the form:
     ```
     chk1-rc-redetection: <file>:<line> — <one-line summary>. Flagged pre-merge; still present. Consider whether the original resolution stands.
     ```

   - **(e) Telemetry.** Ensure the log directory exists, then append one line per suppression event to `.claude/logs/chk1-dedup.log` (append-only, no rotation in this ticket). The `mkdir -p` is required — on a fresh chk1 worktree the `.claude/logs/` directory does not exist, and the first append without it would fail with `No such file or directory`, crashing the loop on its first suppression event:
     ```
     mkdir -p .claude/logs
     echo "<ISO-8601 timestamp>  <file>:<line>  rule_id=<rule>  matched_ticket=<KEY>  matched_comment_id=<id>  precision=<exact|file-only>" >> .claude/logs/chk1-dedup.log
     ```

   - **(f) On no match,** fall through to step 6 (burden of proof) and step 7 (deduplicate) as before.

6. **Burden of proof — asymmetric framing.**
   - P1/P2: keep adversarial framing — "assume defective, find faults".
   - P3/P4: required first comment on the new BACKLOG ticket:
     ```
     Burden-of-proof assessment:
     - Audience: <user | operator | future maintainer>
     - Notice mechanism: <specific way they would notice this>
     - Effort to notice: <low | high>
     - Decision: BACKLOG (severity floor — re-promote if audience or notice mechanism changes)
     ```
   - If you cannot articulate audience and notice mechanism, do NOT file at all — drop silently.

7. **Deduplicate** against existing tickets in the epic by `(file path + rule id + line)` before filing.

8. **Update scan state.** After scanning all branches, write `../../.claude/state/chk1-scan-state.json`:
   ```json
   {
     "branches": {
       "refs/heads/feature/CPT-123-slug": {
         "lastSeenSha": "abc123def456",
         "lastScanTime": "2026-07-07T12:00:00Z"
       }
     },
     "findingsSuppressed": 5,
     "activeBranchesLastTick": true,
     "lastTickTime": "2026-07-07T12:00:00Z"
   }
   ```
   - Prune branches that no longer exist on origin (stale tracking entries).
   - Update `findingsSuppressed` by adding excess findings from this tick.

9. **Write adaptive interval.** After updating scan state, write `../../.claude/state/chk1.next-interval`:
   - `10` if any branch had new commits this tick (active).
   - `30` if no branches had new commits (idle).

## Filing format

- Type: `Code Quality`
- Priority: per `/chk1` severity mapping (P1 → Highest, P2 → High, P3 → Medium, P4 → Low)
- Parent: epic key from `PROJECT_CONFIG.json`
- Summary: `<rule id>: <one-line concrete description> (<file>:<line>)`
- Description: file:line, rule rationale, offending code excerpt, suggested fix. Include `verified against origin/main <sha>` (from premise verification step).

Transition by severity:
- P1/P2 → id `48` (FINDING)
- P3/P4 → id `47` (BACKLOG), burden-of-proof comment FIRST.

## Don't

- Don't wait for an RC trigger from Master. You scan branches directly on every tick.
- Don't file P3/P4 as FINDING — direct to BACKLOG.
- Don't compound on saturated `(issuetype, file)` pairs.
- Don't file findings whose audience and notice mechanism you cannot articulate.
- Don't write code or touch source files.
- Don't re-file findings already open in the epic — dedupe first.
- Don't exceed 3 filings per tick — count and log excess.
- **Don't call EnterPlanMode** — you are in a polling loop, not an interactive session. Plan-mode freezes the iteration until a human resumes it, which blocks the loop indefinitely.
- **Don't call AskUserQuestion** — there is no human watching this session. The loop must be fully autonomous.
- **Don't wait on stdin** for any reason. Every command must complete without interactive input.
- **Don't exit or terminate the session.** The shell-loop driver manages the process lifecycle; exiting breaks the loop.


## Premise verification (before filing) — CPT-844

Before filing any audit / gap / bug / improvement ticket, re-verify EACH asserted codebase gap against **current `origin/main`** — not a prior audit, a stale local checkout, or memory. For each claimed gap: `git fetch origin` then confirm it against `origin/main` (`git show origin/main:<path>`, `git grep <pattern> origin/main`, or read the file at that ref). This is distinct from (and in addition to) the dedup step.

- **Cite the SHA:** record the `origin/main` SHA you verified against in the ticket description (e.g. `verified against origin/main <sha>`), so the Triager and downstream sessions can trust the premise.
- **Drop or downgrade resolved gaps:** if a gap is already closed on `origin/main`, do not file it. In a multi-AC ticket, remove the resolved ACs and set priority from the gaps that STILL EXIST — never let one real gap anchor already-resolved ACs at an inflated priority.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/chk1.heartbeat.json`
- Content: `{"role":"chk1","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<current UTC now — this instance start>","restartCount":<preserved from read, incremented on restart>,"lastRestartAt":"<preserved from read, or UTC now on restart>","lastRestartReason":"<preserved from read: first-start|clean|crash|unknown>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- **On first tick:** read existing heartbeat with the Read tool. If absent, this is first-start (restartCount=0, lastRestartReason="first-start", startedAt=current UTC).
- **Restart detection (CPT-741):** if `.pid` in the existing heartbeat differs from current PID (check with `echo $$`), this is a restart — increment restartCount, set lastRestartAt to now, derive lastRestartReason from prior lastExitCode (0→clean, non-zero→crash).
- **Same instance:** preserve restartCount, lastRestartAt, lastRestartReason from read. Update startedAt to current UTC time.
- **Backward compatibility (CPT-741):** all new fields tolerate absence — use `jq -r '.restartCount // 0'` and `jq -r '.lastRestartAt // empty'` pattern. No migration needed.

## Reference

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/MULTI_SESSION_ARCHITECTURE.md` §7 for the full chk1 protocol. Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/chk1/SKILL.md` for the checker's own docs.
