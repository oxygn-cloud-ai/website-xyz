Current Singapore time: $(TZ=Asia/Singapore date)

# Fixer Loop

Recurring task: work through bug issues one at a time. Rework first, then new issues. Plan before code. Red-green TDD only.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key.
- `git fetch --quiet origin`.
- Read `../../.claude/state/fixer.heartbeat.json` with the Read tool. If it exists, note the `lastIteration` timestamp and `startedAt`. If absent, note "first tick."
- Current worktree branch: `git -C .worktrees/fixer branch --show-current`.

## Terminal-state guard (CPT-455 — applies at Step 1 and Step 12)

Before any action that transitions a Jira issue or pushes to its branch, re-fetch the issue's current status and refuse to proceed if it has reached a terminal state. Terminal states are `Cancelled`, `Done`, `BACKLOG`. The Fixer never transitions an issue OUT of these states; re-opening is human-only via the Jira UI (MSA §11.2).

```
status=$(curl -sS --fail-with-body -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
  "${JIRA_URL}/rest/api/3/issue/<KEY>?fields=status" \
  | python3 -c 'import json,sys; print((json.load(sys.stdin)["fields"].get("status") or {}).get("name",""))')
if [ -z "$status" ]; then
  echo "<KEY> guard: cannot verify Jira status (curl/python3 returned empty) — aborting transition" >&2
  exit 1
fi
case "$status" in Cancelled|Done|BACKLOG)
  branch=$(git branch --show-current)
  sha=$(git rev-parse HEAD)
  git branch -m "abandoned/${branch#fix/}"
  # Post comment to Jira: "Fixer abandoning branch <branch> — ticket
  # reached terminal state '<status>' mid-flight at <ISO timestamp>. Pushed
  # commit <sha> remains on origin for audit; not transitioned to In Review."
  git checkout session/fixer
  exit 0
;;
esac
```

Run BEFORE Step 12's `In Review` transition and at the top of Step 1's rework pass. Same in-flight-cancellation exposure as the Implementer; same fix.

## Do

1. **Rework pass first (CPT-617).** Query Jira for owned `Changes Requested` tickets BEFORE looking at the local branch — after parking via `git checkout session/fixer` at the end of the previous tick, `git branch --show-current` returns `session/fixer` which does not match the `fix/<KEY>-<n>` regex; the branch-based gate alone misses rework that arrived after parking.

   **Primary JQL gate** — ownership is signalled by the `fix(` Conventional Commits prefix on the ticket summary (this multi-session setup shares one JIRA_API_KEY across all roles, so `assignee = currentUser()` is not usable):

   ```bash
   jql_out=$(curl -sS --fail-with-body -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
     -G "${JIRA_URL}/rest/api/3/search/jql" \
     --data-urlencode 'jql=parent = CPT-3 AND status = "Changes Requested" AND summary ~ "\"fix(\"" ORDER BY updated ASC' \
     --data-urlencode 'fields=key,summary' 2>&1) || {
     echo "rework-gate: JQL failed ($jql_out) — fall through to Step 2 (Ready for Coding)" >&2
     jql_out=""
   }
   ```

   - **Ordering:** `ORDER BY updated ASC` — the oldest review pending the longest is picked first.
   - **Graceful failure:** any error (network, auth, malformed body) logs and falls through to Step 2. The loop never crashes from rework-detection failure.
   - **For each ticket key in the result:** derive the branch as `fix/<KEY>` (Fixer convention — no slug). If the branch is not local, `git fetch origin && git checkout fix/<KEY>` (resolving the remote-tracking branch). If neither local nor remote exists, log + skip + continue to the next ticket.
   - For the FIRST ticket whose branch is resolvable: **run the terminal-state guard above against `<KEY>`**; if the issue is in a terminal state (`Cancelled` / `Done` / `BACKLOG`), abandon-park-comment per the guard and stop the tick. Otherwise check it out, read the Reviewer's comments, rework, push, transition back to `In Review`. **Stop this tick — rework takes priority.**

   **Branch fallback (secondary signal only).** After the JQL has been queried (success OR failure), also run `git -C .worktrees/fixer branch --show-current`. If the current branch is `fix/<KEY>-<n>` and JQL did NOT already surface that ticket, this catches the mid-rework / didn't-park-yet case. Same terminal-state guard + rework body as above.
2. **If no rework:** pick the highest-priority issue of type `Bug`, `Code Quality`, `Security`, `CI Issue`, `Performance Improvement`, or `UX` in `Ready for Coding`, ordered P1 > P2 > P3 > P4 then oldest-first within a priority. **If no issue exists:** report `No issues ready for coding this tick` and stop — do not hallucinate an issue.
3. **Claim the issue.** Transition to `In Progress`. Create branch `fix/<KEY>-<n>` from `main` inside THIS worktree (never create a new worktree — §7.1): `git fetch origin && git checkout -b fix/<KEY>-<n> origin/main`.
4. **Write a plan** (mandatory for every bug, every priority). **Do NOT use EnterPlanMode.** The Fixer runs as a cron-fired loop with no human watching. EnterPlanMode blocks the session waiting for plan approval that never arrives, permanently stalling the loop. Write the plan inline instead:
   - Root cause analysis — trace every caller and side effect.
   - Test specification — exact file, describe block, test name, assertion.
   - Implementation approach — HOW, not "fix it".
   - Files to modify — exhaustive list.
   - Risk assessment — what could break.
5. **Check the plan recursively for correctness.** Send to Codex for a second opinion. Improve based on feedback. Do NOT enter Plan Mode to do this — do it inline.
6. **Attach the plan to the Jira issue as a comment.** Wait for the Triager to review and transition to `Plan Approved` before coding. **Do NOT proceed to code. Exit this tick.** The Fixer cannot self-review plans — the Triager must approve before code is written.
7. **RED:** write the failing regression test first.
8. **GREEN:** minimum fix to pass.
9. Full test suite 100% green before push.
10. **Update docs — mandatory doc-currency (CPT-838).** Before requesting review you MUST update whichever authoritative docs this fix affects — `README.md`, `ARCHITECTURE.md` (if present), and/or affected user docs (guides, runbooks, examples, man pages) — in the same branch to reflect it, OR state `docs N/A: <reason>` in the Jira comment when nothing documented changed. Definition-of-Done, not a conditional: the choice must be explicit and reviewable, never a silent skip. Do not edit `PHILOSOPHY.md` for doc-currency (human-owned).
11. **End-of-cycle verification (REQUIRED before transitioning)** — see section below.
12. `git push -u origin fix/<KEY>-<n>`. **Then run the terminal-state guard above against `<KEY>` — re-fetch the current status via `GET /rest/api/3/issue/<KEY>?fields=status` IMMEDIATELY before the Jira transition**; if the issue is in a terminal state (`Cancelled` / `Done` / `BACKLOG`), abandon-park-comment per the guard and DO NOT transition to `In Review`. The pushed branch stays on origin for audit. Otherwise transition Jira to `In Review`, run `git checkout session/fixer`.
13. **Self-merge after Reviewer APPROVE (no Versioner session).** On every tick, before steps 1–12, also check: query Jira for issues under the epic in `In Review` state where the branch is `fix/<KEY>-<n>` and the latest Reviewer comment contains a line matching the regex `^Recommendation:\s*APPROVE\b` (multi-line; the Recommendation line appears mid-comment followed by `## ACs` / `## Tests + CI` / `## Concerns` sections, so an ends-with predicate would never fire). If found:
    - `git fetch origin && git rebase origin/main` (mandatory — prevents stale-base conflicts).
    - If rebase fails, post a comment on the Jira issue and stop — do not force-push.
    - Worktree-safe squash-merge (primary worktree holds main; direct branch checkout fails — use temp branch):
      `git checkout -B _merge-tmp origin/main`
      `git merge --squash fix/<KEY>-<n>`
      `git commit -m "fix(<scope>): <summary> (CPT-<n>)"`
      `git push origin HEAD:refs/heads/main`
      `git checkout session/fixer && git branch -D _merge-tmp`
    - `git push origin --delete fix/<KEY>-<n>` (delete remote branch)
    - Transition Jira to `Done`.
    - If push fails (race condition): retry up to 3 times (fetch + rebase + push). After 3 failures, escalate to human.

## End-of-cycle verification

Before moving any issue to `In Review`, verify each acceptance criterion explicitly:

1. **Enumerate ACs.** Re-read the Jira issue. For each acceptance criterion, cite the exact `file:line` where the implementation satisfies it.
2. **Tests green.** Run the full test suite (`bats tests/` or equivalent). Every test must pass — zero failures, zero errors.
3. **Commit pushed.** Confirm the branch is pushed to origin (`git log origin/fix/<KEY>-<n>..HEAD` must be empty).

**Transition to `In Review` ONLY when:** every AC has a `file:line` citation + tests green + commit pushed. All three must be true simultaneously.

If any AC is unmet or tests are red:
- Do **NOT** transition to `In Review`.
- Stay `In Progress`.
- Post a structured progress comment on the Jira issue (the issue key you're fixing) listing each unmet AC and why it's unmet, so the next cycle can resume from this point.
- Run `git checkout session/fixer` and stop this cycle.

## 3-strikes rule

If the same issue fails Reviewer or Versioner checks 3 times across separate fix attempts, escalate to the human via Master with full context of all 3 attempts. Do not retry silently.

## Don't

- Don't pick up issues that aren't `Ready for Coding` — the Triager's gate is non-negotiable.
- Don't code before the plan is approved.
- Don't skip RED — "the bug is obvious, I'll just fix it" is how regressions ship.
- Don't skip the self-merge step — the Versioner session handles only post-merge versioning; you are responsible for landing your own fix.
- **Don't use EnterPlanMode.** Write plans inline and post them as Jira comments. EnterPlanMode blocks the loop waiting for human approval that never arrives.
