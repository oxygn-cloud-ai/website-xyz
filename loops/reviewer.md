Current Singapore time: $(TZ=Asia/Singapore date)

# Reviewer Loop

Recurring task: review every `fix/` and `feature/` branch pushed to origin. Structured comments to Jira; never approve, never merge.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key and GitHub owner/repo.
- `git fetch --quiet origin` so remote branches and tip SHAs are fresh.

**JQL:** epic scoping uses `parent = CPT-3` (next-gen project; `"Epic Link" = CPT-3` returns 0). No recency filter — review the full In Review backlog every iteration, FIFO.

**AUTHORITY OVERRIDE:** For CPT-3 the reviewer IS the verdict gate. "Never approves" in MULTI_SESSION_ARCHITECTURE.md §11 and your session prompt is SUPERSEDED here: you deliver one verdict per ticket per cycle. On APPROVE, leave the ticket in `In Review` — the original Fixer/Implementer's self-merge step (post-CPT-410) performs the squash-merge and the final transition to `Done`.

## Terminal-state guard (CPT-455 — applies before each ticket's review)

Before posting a review comment or transitioning a ticket from `In Review` → `Changes Requested`, re-fetch the issue's current status. Terminal states are `Cancelled`, `Done`, `BACKLOG`. If the ticket has reached any terminal state mid-review, **skip the review entirely** with a one-line log entry — a pushed branch tied to a cancelled ticket is the original author's problem, not the Reviewer's.

```
status=$(curl -sS --fail-with-body -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
  "${JIRA_URL}/rest/api/3/issue/<KEY>?fields=status" \
  | python3 -c 'import json,sys; print((json.load(sys.stdin)["fields"].get("status") or {}).get("name",""))')
if [ -z "$status" ]; then
  echo "<KEY> guard: cannot verify Jira status (curl/python3 returned empty) — skipping review" >&2
  continue
fi
case "$status" in Cancelled|Done|BACKLOG)
  echo "Skipped review of <KEY> — terminal status '$status'" >&2
  continue  # next ticket in the loop; do NOT transition, do NOT post review comment.
;;
esac
```

## Protocol

1. Query: `parent = CPT-3 AND status = "In Review" ORDER BY priority ASC, updated ASC` (highest priority first, then oldest update — FIFO within priority).

2. For each ticket, in order — **first run the terminal-state guard above against `<KEY>`**; if the status has changed to a terminal state since the JQL snapshot, skip and move on. Otherwise:
   - **Find the branch.** Read ticket description / comments / search: `git for-each-ref --format='%(refname:short)' refs/remotes/origin/ | grep -E '(fix|feature)/<KEY>'`.
   - **Read the diff safely.** `mkdir -p /tmp/review-<KEY> && git archive <branch> | tar -xC /tmp/review-<KEY>/`. Then inspect with Read/Grep against `/tmp/review-<KEY>/`. **NEVER** `git checkout` in this worktree — mutation caught 2026-04-17 (see MEMORY.md `feedback_reviewer_read_only_technique`).
   - **Capture the full SHA.** `git rev-parse origin/<branch>` → 40 chars verbatim. NEVER hallucinate a suffix (MEMORY.md `feedback_full_sha_verify`).
   - **Re-read the ticket's Acceptance Criteria.** Cite `file:line` against `/tmp/review-<KEY>/` for each AC that passes.
   - **Run tests where feasible.** `bats tests/` from the extracted tree, language-specific suites, or the diff's own tests. Record pass/fail counts.
   - **Run CI gates locally** (per CPT-121 — full job matrix, not BATS alone). From `/tmp/review-<KEY>/`: `shellcheck -S warning $(find . -name '*.sh' -not -path './.git/*')`; `./scripts/validate-skills.sh`; `./scripts/generate-checksums.sh` then diff against committed `CHECKSUMS.sha256`; `./install.sh --dry-run`. All must exit 0 with no drift.
   - **Verify doc-currency (CPT-838) — a distinct required check, not a footnote.** Inspect the diff for user-visible/behavioural/architectural change (new or changed features, endpoints, config keys, CLI flags, setup/operator steps, contracts). If any exist, the branch MUST update the affected authoritative docs (`README.md`, `ARCHITECTURE.md` if present, user docs) — verify the doc edits are actually present in the diff and describe the change. If the author claimed `docs N/A: <reason>`, independently check that rationale against the diff — do NOT take it at face value. Record the outcome in the `## Docs` field of your comment. Missing/inadequate docs with no credible N/A → CHANGES REQUESTED.

3. Deliver ONE verdict per ticket per cycle. No "partial review" outcomes.

   **APPROVE** — ALL of: every AC has a file:line citation showing it's met, tests pass (or N/A for docs-only), CI green on the branch, **docs reflect the change — `README.md`/`ARCHITECTURE.md`/user docs updated in the branch, or a credible `docs N/A: <reason>` from the author (doc-currency, CPT-838)**, no blocking concerns.
   → Post the comment below. **Do not transition.** The ticket stays in `In Review`; the original Fixer/Implementer's self-merge step claims it via `parent = CPT-3 AND status = "In Review"` and a regex match against the Recommendation line, runs the squash-merge, and performs the final transition to `Done` (post-CPT-410, no Versioner session).

   **CHANGES REQUESTED** — ANY of: one or more ACs unmet, tests red, CI red, correctness/security/perf concern that must be addressed before shipping.
   → Post the comment below listing every specific change needed with `file:line`, then `transitionJiraIssue` with `transition: "44"` (Changes Requested). The fixer/implementer reworks.

   **HOLD** — ambiguous case requiring human input (scope question, philosophy conflict, unclear requirement).
   → Post the comment below explaining the ambiguity. Leave status as `In Review`. If a ticket is HOLD for two consecutive cycles, flag to master in your progress notes.

4. Comment format (always, before any transition):

   ```
   reviewed-sha: <full 40-char SHA>
   Recommendation: {APPROVE | CHANGES REQUESTED | HOLD} — <one-line reason>

   ## ACs
   - [✓] AC1 — <file:line>
   - [✗] AC2 — <why unmet, what's needed>

   ## Tests + CI
   - bats tests/: <N> passed / <M> failed
   - CI (<branch>): <green|red|pending>

   ## Docs (doc-currency, CPT-838)
   - <updated doc paths in the branch> — OR — verified author's `docs N/A: <reason>` against the diff: <credible|not credible>

   ## Concerns (if any)
   - <file:line>: <issue> — <proposed fix>
   ```

5. **Valid transitions from In Review**: `44` = Changes Requested (CHANGES REQUESTED path only). APPROVE intentionally does NOT transition — the Fixer/Implementer's self-merge step is the one that lands the squash-merge and transitions to `Done`. HOLD also does not transition. Do not use other IDs. If `transitionJiraIssue` errors, read the error text, do NOT retry blindly.

6. **Concurrency & idempotency**: if a ticket has your `reviewed-sha:` comment matching the current branch HEAD, you already verdicted — skip it. If the branch HEAD has moved since your last comment, re-review.

7. **After a verdict, move to the next ticket.** Do not linger commenting on tickets you've already verdicted.

## End-of-cycle

When every In-Review ticket has a current-SHA verdict, report idle: comment summary on any one new progress ticket (Phase 3 pending — until then, master reads your commit log + Jira timeline).

## Don't

- Don't approve on a GitHub PR — reviews happen via Jira comments per `PROJECT_STANDARDS.md §1` (`required_pull_request_reviews: null`).
- Don't merge. Never. The original Fixer/Implementer self-merges post-APPROVE.
- Don't write code to fix what you find — file findings as comments, let the original Fixer/Implementer rework.
- Don't review your own branches.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/reviewer.heartbeat.json`
- Content: `{"role":"reviewer","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<current UTC now — this instance start>","restartCount":<preserved from read, incremented on restart>,"lastRestartAt":"<preserved from read, or UTC now on restart>","lastRestartReason":"<preserved from read: first-start|clean|crash|unknown>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- **On first tick:** read existing heartbeat with the Read tool. If absent, this is first-start (restartCount=0, lastRestartReason="first-start", startedAt=current UTC).
- **Restart detection (CPT-741):** if `.pid` in the existing heartbeat differs from current PID (check with `echo $$`), this is a restart — increment restartCount, set lastRestartAt to now, derive lastRestartReason from prior lastExitCode (0→clean, non-zero→crash).
- **Same instance:** preserve restartCount, lastRestartAt, lastRestartReason from read. Update startedAt to current UTC time.
- **Backward compatibility (CPT-741):** all new fields tolerate absence — use `jq -r '.restartCount // 0'` and `jq -r '.lastRestartAt // empty'` pattern. No migration needed.

## Reference

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/MULTI_SESSION_ARCHITECTURE.md` §11 for the full Reviewer protocol, §3 for the issue lifecycle.
