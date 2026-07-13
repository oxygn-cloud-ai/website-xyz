# PerformanceReviewer Loop

Recurring task: assess performance of commits since the last release. File findings as Jira `Performance Improvement` tasks under the project's epic. **RC-cadence only.** Never write code.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key.
- `git fetch --quiet origin`.
- Resolve the RC trigger SHA (set by Master when an RC is available):
  ```
  TRIGGER=$(git show-ref --hash refs/audit/performance-rc-trigger 2>/dev/null || echo "")
  ```
- Resolve the last-audited SHA:
  ```
  LAST_SEEN=$(git show-ref --hash refs/audit/performance-last-seen 2>/dev/null || echo "")
  ```

## Cadence — RC-gated

- `TRIGGER` empty: idle. Master has not signalled an RC. Stop this tick.
- `TRIGGER == LAST_SEEN`: idle. Already audited. Stop.
- Else: proceed with review of diff range `<LAST_SEEN>..<TRIGGER>`.

## Do

1. **Review commits** since the last release tag. Diff range: `<LAST_SEEN>..<TRIGGER>`.

2. **Assess for:** regressions, N+1 queries, unbounded loops, memory leaks, unnecessary allocations, missing caching, slow algorithms, large asset loads.

3. **File findings** as Jira issues:
   - Type: `Performance Improvement`
   - Priority: P1 (release-blocking), P2 (high), P3 (medium), P4 (low)
   - Parent: epic key from `PROJECT_CONFIG.json`
   - Label: `PI`

4. **Release gate:** If any PI issue is P1 or P2, the release is blocked until addressed.

5. **Advance the audit pointer:**
   ```
   git update-ref refs/audit/performance-last-seen "$TRIGGER"
   git push origin refs/audit/performance-last-seen
   ```

## Don't

- Don't run per-commit. Wait for Master's RC trigger.
- Don't write code. File issues only.

## Premise verification (before filing) — CPT-844

Before filing any audit / gap / bug / improvement ticket, re-verify EACH asserted codebase gap against **current `origin/main`** — not a prior audit, a stale local checkout, or memory. For each claimed gap: `git fetch origin` then confirm it against `origin/main` (`git show origin/main:<path>`, `git grep <pattern> origin/main`, or read the file at that ref). This is distinct from (and in addition to) the dedup step.

- **Cite the SHA:** record the `origin/main` SHA you verified against in the ticket description (e.g. `verified against origin/main <sha>`), so the Triager and downstream sessions can trust the premise.
- **Drop or downgrade resolved gaps:** if a gap is already closed on `origin/main`, do not file it. In a multi-AC ticket, remove the resolved ACs and set priority from the gaps that STILL EXIST — never let one real gap anchor already-resolved ACs at an inflated priority.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/performance.heartbeat.json`
- Content: `{"role":"performance","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<preserved from read, or UTC now on first tick>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.

## Reference

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/MULTI_SESSION_ARCHITECTURE.md` §9 for the full PerformanceReviewer protocol.
