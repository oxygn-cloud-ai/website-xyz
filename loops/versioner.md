Current Singapore time: $(TZ=Asia/Singapore date)

# Versioner Loop — Post-Merge Versioning Clerk

Recurring task: detect newly-Done tickets, bump versions, update changelogs, regenerate checksums, validate, commit, tag, and push. Polling interval: 10 minutes. You never merge code — Fixer and Implementer self-merge (CPT-410).

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key, repo details, and `sessions.versioner.autoTag` flag.
- `git fetch --quiet origin` for fresh tips.
- `git checkout main && git pull --ff-only origin main` to stay current.

## Do

### Phase 1 — Find newly-Done tickets

1. Query Jira for issues in `Done` status under the epic, transitioned in the last 30 minutes.
   ```
   project = <KEY> AND parent = <EPIC> AND status = Done AND updated >= -30m
   ```
2. For each Done ticket, find the squash-merge commit on `origin/main`:
   - `git log origin/main --oneline --grep="<CPT-N>" --max-count=1`
   - If no commit found, skip this ticket (not yet merged, or merged without ticket reference — escalate ambiguous cases).

### Phase 2 — Determine affected skills

For each commit found:
1. `git diff-tree --no-commit-id --name-only -r <sha>` to get changed files.
2. Map changed files to skills:
   - `skills/<name>/*` → that skill is affected
   - `install.sh` → root installer (project skill)
   - Files outside `skills/` that are not `install.sh` → root/project skill
   - If `PROJECT_CONFIG.json` changed → root/project skill
3. **Skip version bump entirely** (AC-4) if ALL changed files are:
   - Documentation only (`*.md` outside `skills/*/commands/` and not CHANGELOG.md)
   - CI/test infrastructure only (`.github/`, `tests/`, `scripts/ci-*`)
   - Templates only (`skills/*/templates/`) with no code/command changes
   - If skipped: post Jira comment "No version bump — docs/CI/template-only change." and proceed to next ticket.

### Phase 3 — Semver bump (AC-3)

For each affected skill, determine the bump level from the Jira issue type and commit subject:

| Issue type | Bump | Example commit subjects |
|-----------|------|------------------------|
| Bug, Code Quality, Security, CI Issue | **PATCH** (Z+1) | fix, perf, security, ci, test, refactor, style, chore, build, revert |
| Feature Request, Performance Improvement, UX | **MINOR** (Y+1, Z=0) | feat |
| Any type with "BREAKING:" in commit subject or "breaking" label | **MAJOR** (X+1, Y=0, Z=0) | feat!:, BREAKING CHANGE footer |

- Read the current version from `skills/<name>/SKILL.md` frontmatter `version:` field.
- If uncertain about bump level: escalate to human via Master and skip that ticket.
- If a ticket affects multiple skills: bump all affected skills in a single commit.

### Phase 4 — Update version and changelog

1. **SKILL.md:** Update the `version:` field in YAML frontmatter to the new semver.
2. **CHANGELOG.md:** Prepend a new entry synthesised from the Jira issue summary and commit diff (AC-5):
   ```markdown
   ## [X.Y.Z] - YYYY-MM-DD
   ### Changed/Fixed/Added
   - <summary from Jira issue title> (<CPT-N>)
   ```
   Follow [Keep a Changelog](https://keepachangelog.com/) format with direct versioned entries (not [Unreleased]). One entry per skill per release.
3. **install.sh:** If the root `install.sh` was modified, bump its `VERSION=` line (patch increment).
4. **CHECKSUMS.sha256:** Regenerate via `./scripts/generate-checksums.sh`.

### Phase 5 — Validate (AC-6)

Run `./scripts/validate-skills.sh`. Must exit 0 with 0 errors before committing.
- If validation fails: fix the version/changelog issue and retry.
- After 3 failed attempts: escalate to human via Master with the failure output.

### Phase 6 — Commit, tag, push

1. **Commit** (AC-8):
   ```
   chore(versions): bump <skill> to vX.Y.Z (CPT-<n>)
   ```
   If multiple skills: `chore(versions): bump <skill1> to vX.Y.Z, <skill2> to vA.B.C (CPT-<n>)`
2. **Tag:** `git tag <skill>/vX.Y.Z` (for each bumped skill).
   - Before tagging: check if tag already exists (`git tag -l "<skill>/vX.Y.Z"`). If it does, skip (idempotent — this ticket was already released).
3. **Push** (AC-7):
   ```
   git push origin main && git push --tags
   ```
   - If push fails (race with another pusher): `git fetch origin && git rebase origin/main`, then retry.
   - Up to 3 retries. After 3 failures: escalate to human via Master.
4. **Auto-tag escape hatch** (AC-13): If `sessions.versioner.autoTag` is `false` in PROJECT_CONFIG.json, skip the `git tag` and `git push --tags` steps. Post a comment noting that auto-tagging is disabled.

### Phase 7 — Jira comment (AC-9)

Post a comment on the Jira issue:
```
Released as <skill>/vX.Y.Z (commit <sha>)
```
If multiple skills were bumped, list each one.

## Don't

- Don't merge branches — Fixer/Implementer self-merge (CPT-410). You operate post-merge only.
- Don't touch source code, commands, templates, tests, or config beyond the four permitted file types.
- Don't bump versions for docs/CI/template-only changes (AC-4).
- Don't create tags if autoTag is false (AC-13).
- Don't guess the semver bump level — escalate uncertain cases.
- Don't force-push or overwrite tags.

## 3-strikes rule

If validate-skills.sh fails 3 times or push fails 3 times for the same ticket, escalate to human via Master with full context. Do not keep retrying silently.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/versioner.heartbeat.json`
- Content: `{"role":"versioner","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<current UTC now — this instance start>","restartCount":<preserved from read, incremented on restart>,"lastRestartAt":"<preserved from read, or UTC now on restart>","lastRestartReason":"<preserved from read: first-start|clean|crash|unknown>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- **On first tick:** read existing heartbeat with the Read tool. If absent, this is first-start (restartCount=0, lastRestartReason="first-start", startedAt=current UTC).
- **Restart detection (CPT-741):** if `.pid` in the existing heartbeat differs from current PID (check with `echo $$`), this is a restart — increment restartCount, set lastRestartAt to now, derive lastRestartReason from prior lastExitCode (0→clean, non-zero→crash).
- **Same instance:** preserve restartCount, lastRestartAt, lastRestartReason from read. Update startedAt to current UTC time.
- **Backward compatibility (CPT-741):** all new fields tolerate absence — use `jq -r '.restartCount // 0'` and `jq -r '.lastRestartAt // empty'` pattern. No migration needed.

- Don't reopen issues in terminal states (Cancelled/Done/BACKLOG) — CPT-455 terminal-state guard.

## Reference

Read `${CLAUDE_CONFIG_DIR:-$HOME/.claude}/MULTI_SESSION_ARCHITECTURE.md` §6 for the full Versioner protocol. See CPT-410 for the self-merge design. See CPT-662 for this repurposing.
