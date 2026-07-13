Current Singapore time: $(TZ=Asia/Singapore date)

# Implementer Loop

Recurring task: work through feature requests one at a time. Rework first, then new. Red-green TDD only.

## Load context (every tick)

- Read `../../.claude/state/implementer.heartbeat.json` with the Read tool. If it exists, note the `lastIteration` timestamp and `startedAt`. If absent, note "first tick."
- Read `PROJECT_CONFIG.json` for the Jira epic key.
- `git fetch --quiet origin`.
- Current worktree branch: `git -C .worktrees/implementer branch --show-current`.

## Terminal-state guard (CPT-455 — applies at Step 1 and Step 9)

Before any action that transitions a Jira issue or pushes to its branch, re-fetch the issue's current status and refuse to proceed if it has reached a terminal state. Terminal states (for the CPT project) are `Cancelled`, `Done`, `BACKLOG`. The Implementer never transitions an issue OUT of these states; re-opening is a human-only action via the Jira UI (MSA §11.2).

```
status=$(curl -sS --fail-with-body -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
  "${JIRA_URL}/rest/api/3/issue/<KEY>?fields=status" \
  | python3 -c 'import json,sys; print((json.load(sys.stdin)["fields"].get("status") or {}).get("name",""))')
if [ -z "$status" ]; then
  echo "<KEY> guard: cannot verify Jira status (curl/python3 returned empty) — aborting transition" >&2
  exit 1
fi
case "$status" in Cancelled|Done|BACKLOG)
  # Abandon-park-comment sequence:
  branch=$(git branch --show-current)
  sha=$(git rev-parse HEAD)
  git branch -m "abandoned/${branch#feature/}"
  # Post comment to Jira: "Implementer abandoning branch <branch> — ticket
  # reached terminal state '<status>' mid-flight at <ISO timestamp>. Pushed
  # commit <sha> remains on origin for audit; not transitioned to In Review."
  git checkout session/implementer
  exit 0
;;
esac
```

The guard MUST run BEFORE Step 9's `In Review` transition (so a mid-flight cancellation cannot be silently reversed by the Implementer pushing and transitioning), and at the top of Step 1's rework pass (so a Cancelled ticket whose old branch is checked out doesn't get re-worked).

## Do

1. **Rework pass first (CPT-617).** Query Jira for owned `Changes Requested` tickets BEFORE looking at the local branch — after parking via `git checkout session/implementer` at the end of the previous tick, `git branch --show-current` returns `session/implementer` which does not match the `feature/<KEY>-<n>-<slug>` regex; the branch-based gate alone misses rework that arrived after parking.

   **Primary JQL gate** — ownership is signalled by the `feat(` Conventional Commits prefix on the ticket summary (this multi-session setup shares one JIRA_API_KEY across all roles, so `assignee = currentUser()` is not usable):

   ```bash
   jql_out=$(curl -sS --fail-with-body -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
     -G "${JIRA_URL}/rest/api/3/search/jql" \
     --data-urlencode 'jql=parent = CPT-3 AND status = "Changes Requested" AND summary ~ "\"feat(\"" ORDER BY updated ASC' \
     --data-urlencode 'fields=key,summary' 2>&1) || {
     echo "rework-gate: JQL failed ($jql_out) — fall through to Step 2 (Ready for Coding)" >&2
     jql_out=""
   }
   ```

   - **Ordering:** `ORDER BY updated ASC` — the oldest review pending the longest is picked first.
   - **Graceful failure:** any error (network, auth, malformed body) logs and falls through to Step 2. The loop never crashes from rework-detection failure.
   - **For each ticket key in the result:** resolve the branch via `git branch --list 'feature/<KEY>-*'` (Implementer's `<slug>` portion varies). If no local branch, `git fetch origin && git branch --list 'feature/<KEY>-*' 'origin/feature/<KEY>-*'` — the first match wins. If neither resolves, log + skip + continue to the next ticket.
   - For the FIRST ticket whose branch is resolvable: **run the terminal-state guard above against `<KEY>`**; if the issue is in a terminal state (`Cancelled` / `Done` / `BACKLOG`), abandon-park-comment per the guard and stop the tick. Otherwise check it out, read the Reviewer's comments, rework, push, transition back to `In Review`. **Stop this tick — rework takes priority.**

   **Branch fallback (secondary signal only).** After the JQL has been queried (success OR failure), also run `git -C .worktrees/implementer branch --show-current`. If the current branch matches `feature/<KEY>-<n>-<slug>` and JQL did NOT already surface that ticket, this catches the mid-rework / didn't-park-yet case. Same terminal-state guard + rework body as above.
2. **If no rework:** pick the highest-priority `Feature Request` in `Ready for Coding`, ordered P1 > P2 > P3 > P4 then oldest-first within a priority. **If no issue exists:** report `No issues ready for coding this tick` and stop — do not hallucinate an issue.
3. **Claim the issue.** Transition to `In Progress`. Create branch `feature/<KEY>-<n>-<slug>` from `main` inside THIS worktree (never a new worktree — §7.1): `git fetch origin && git checkout -b feature/<KEY>-<n>-<slug> origin/main`.
4. **Red-green TDD.** For each acceptance criterion in the issue:
   - Write a failing test first.
   - Write the minimum code to pass.
   - Refactor with tests green.
5. **Atomic commits** referencing the Jira issue key in the subject.
6. Full test suite must pass before push.
7. **Update docs — mandatory doc-currency (CPT-838).** Before requesting review you MUST update whichever authoritative docs this change affects — `README.md`, `ARCHITECTURE.md` (if present), and/or affected user docs (guides, runbooks, examples, man pages) — in the same branch to reflect it, OR state `docs N/A: <reason>` in the Jira comment when nothing documented changed. Definition-of-Done, not a conditional: the choice must be explicit and reviewable, never a silent skip. Do not edit `PHILOSOPHY.md` for doc-currency (human-owned).
8. **End-of-cycle verification (REQUIRED before transitioning)** — see section below.
9. `git push -u origin feature/<KEY>-<n>-<slug>`. **Then run the terminal-state guard above against `<KEY>` — re-fetch the current status via `GET /rest/api/3/issue/<KEY>?fields=status` IMMEDIATELY before the Jira transition**; if the issue is in a terminal state (`Cancelled` / `Done` / `BACKLOG`), abandon-park-comment per the guard and DO NOT transition to `In Review`. The pushed branch stays on origin for audit. Otherwise transition Jira to `In Review`, run `git checkout session/implementer`.
10. **Self-merge after Reviewer APPROVE (no Versioner session).** On every tick, before steps 1–9, also check: query Jira for issues under the epic in `In Review` state where the branch is `feature/<KEY>-<n>-*` and the latest Reviewer comment contains a line matching the regex `^Recommendation:\s*APPROVE\b` (multi-line; the Recommendation line appears mid-comment followed by `## ACs` / `## Tests + CI` / `## Concerns` sections, so an ends-with predicate would never fire). If found:
    - `git fetch origin && git rebase origin/main` (mandatory — prevents stale-base conflicts).
    - If rebase fails, post a comment on the Jira issue and stop — do not force-push.
    - Worktree-safe squash-merge (primary worktree holds main; direct branch checkout fails — use temp branch):
      `git checkout -B _merge-tmp origin/main`
      `git merge --squash feature/<KEY>-<n>-<slug>`
      `git commit -m "feat(<scope>): <summary> (CPT-<n>)"`
      `git push origin HEAD:refs/heads/main`
      `git checkout session/implementer && git branch -D _merge-tmp`
    - `git push origin --delete feature/<KEY>-<n>-<slug>` (delete remote branch)
    - Transition Jira to `Done`.
    - If push fails (race condition): retry up to 3 times (fetch + rebase + push). After 3 failures, escalate to human.

## End-of-cycle verification

Before moving any issue to `In Review`, verify each acceptance criterion explicitly:

1. **Enumerate ACs.** Re-read the Jira issue. For each acceptance criterion, cite the exact `file:line` where the implementation satisfies it.
2. **Tests green.** Run the full test suite (`bats tests/` or equivalent). Every test must pass — zero failures, zero errors.
3. **Commit pushed.** Confirm the branch is pushed to origin (`git log origin/feature/<KEY>-<n>-<slug>..HEAD` must be empty).

**Transition to `In Review` ONLY when:** every AC has a `file:line` citation + tests green + commit pushed. All three must be true simultaneously.

If any AC is unmet or tests are red:
- Do **NOT** transition to `In Review`.
- Stay `In Progress`.
- Post a structured progress comment on the Jira issue (the issue key you're implementing) listing each unmet AC and why it's unmet, so the next cycle can resume from this point.
- Run `git checkout session/implementer` and stop this cycle.

## Sub-agents

Use them when independent components can be implemented in parallel. Not by default.

## Don't

- Don't pick up issues that aren't `Ready for Coding`.
- Don't skip the failing test. "Trivial feature, no test needed" produces regressions the moment the feature interacts with anything else.
- Don't skip the self-merge step — the Versioner session handles only post-merge versioning; you are responsible for landing your own feature.
- **Don't use EnterPlanMode.**

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/implementer.heartbeat.json`
- Content: `{"role":"implementer","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<current UTC now — this instance start>","restartCount":<preserved from read, incremented on restart>,"lastRestartAt":"<preserved from read, or UTC now on restart>","lastRestartReason":"<preserved from read: first-start|clean|crash|unknown>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- **On first tick:** read existing heartbeat with the Read tool. If absent, this is first-start (restartCount=0, lastRestartReason="first-start", startedAt=current UTC).
- **Restart detection (CPT-741):** if `.pid` in the existing heartbeat differs from current PID (check with `echo $$`), this is a restart — increment restartCount, set lastRestartAt to now, derive lastRestartReason from prior lastExitCode (0→clean, non-zero→crash).
- **Same instance:** preserve restartCount, lastRestartAt, lastRestartReason from read. Update startedAt to current UTC time.
- **Backward compatibility (CPT-741):** all new fields tolerate absence — use `jq -r '.restartCount // 0'` and `jq -r '.lastRestartAt // empty'` pattern. No migration needed.
