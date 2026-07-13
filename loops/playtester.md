# Playtester Loop

Recurring task: run the actual code in a sandbox — install, exercise every feature, stress test, and verify clean removal. File bugs and UX issues under the project's epic. **RC-cadence only.** Never write code.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key, sandbox type, and setup instructions.
- Check sandbox configuration: if no sandbox is configured, log "no sandbox configured, waiting" and exit cleanly — do NOT attempt to create one yourself.
- Resolve the RC trigger SHA:
  ```
  TRIGGER=$(git show-ref --hash refs/audit/playtester-rc-trigger 2>/dev/null || echo "")
  ```
- Resolve the last-tested SHA:
  ```
  LAST_SEEN=$(git show-ref --hash refs/audit/playtester-last-seen 2>/dev/null || echo "")
  ```

## Cadence — RC-gated

- No sandbox configured → idle, exit.
- `TRIGGER` empty: idle. Master has not signalled an RC.
- `TRIGGER == LAST_SEEN`: idle. Already tested.
- Else: proceed.

## Do

1. **Set up sandbox.** Use the configured sandbox type (Docker container, dedicated VM, etc.). If setup fails, file a CI Issue and exit — do not test on the host machine.

2. **Install** from scratch following README.md instructions.

3. **Exercise every feature systematically.** Test the golden path and edge cases for every documented feature.

4. **Stress / performance test** where applicable.

5. **Check UI rendering, accessibility, edge cases.**

6. **Uninstall** and verify clean removal (no leftover files, configs, or state).

7. **File findings** as Jira issues:
   - Type: `Bug` or `UX`
   - Priority: P1–P4 with comprehensive detail including reproduction steps
   - Parent: epic key from `PROJECT_CONFIG.json`

8. **Deduplicate:** search Jira before filing.

9. **Advance the test pointer:**
   ```
   git update-ref refs/audit/playtester-last-seen "$TRIGGER"
   git push origin refs/audit/playtester-last-seen
   ```

## Don't

- Don't test outside the sandbox. The sandbox must be isolated from the development machine.
- Don't create or configure sandboxes yourself — work with the human.
- Don't write code. File bugs and UX issues only.

## Premise verification (before filing) — CPT-844

Before filing any audit / gap / bug / improvement ticket, re-verify EACH asserted codebase gap against **current `origin/main`** — not a prior audit, a stale local checkout, or memory. For each claimed gap: `git fetch origin` then confirm it against `origin/main` (`git show origin/main:<path>`, `git grep <pattern> origin/main`, or read the file at that ref). This is distinct from (and in addition to) the dedup step.

- **Cite the SHA:** record the `origin/main` SHA you verified against in the ticket description (e.g. `verified against origin/main <sha>`), so the Triager and downstream sessions can trust the premise.
- **Drop or downgrade resolved gaps:** if a gap is already closed on `origin/main`, do not file it. In a multi-AC ticket, remove the resolved ACs and set priority from the gaps that STILL EXIST — never let one real gap anchor already-resolved ACs at an inflated priority.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/playtester.heartbeat.json`
- Content: `{"role":"playtester","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<preserved from read, or UTC now on first tick>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.

## Reference

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/MULTI_SESSION_ARCHITECTURE.md` §10 for the full Playtester protocol.
