Current Singapore time: $(TZ=Asia/Singapore date)

# Releaser Loop

Recurring task: detect releasable work, coordinate versioning and changelog updates.

## Load context (every tick)

- Read `PROJECT_CONFIG.json` for the Jira epic key and repo details.
- `git fetch --quiet origin`.
- Read `../../.claude/state/releaser.heartbeat.json` with the Read tool. If it exists, note the `lastIteration` timestamp and `startedAt`. If absent, note "first tick."
- Read `../../.claude/state/releaser.md` (state file) for last-release timestamps per skill.

## Do

1. **Detect releasable work.** For each skill directory in `skills/*/SKILL.md`:
   - Find the latest namespaced tag: `git tag -l "<skill>/v*" --sort=-v:refname | head -1`.
   - List commits on `main` since that tag touching `skills/<skill>/`.
   - If no new commits, skip this skill.

2. **Determine version bump.** From commit subjects since last tag:
   - `feat(` → minor bump.
   - `fix(` → patch bump.
   - `BREAKING` in body or `!:` in subject → major bump.
   - Highest wins.

3. **Update artifacts.** For each skill with releasable work:
   - Bump version in `skills/<skill>/SKILL.md` frontmatter.
   - Add changelog entry to `skills/<skill>/CHANGELOG.md` with ticket references.
   - Regenerate `CHECKSUMS.sha256` via `./scripts/generate-checksums.sh`.

4. **Commit + tag + push.**
   - Single commit: `chore(<skill>): release <skill> v<version>`.
   - Create tag: `<skill>/v<version>`.
   - Push commit and tag.

5. **Report.** Post Jira comment on the project epic summarising the release.

6. **Update state file.** Write per-skill last-release timestamps to `../../.claude/state/releaser.md`.

## Don't

- Don't release if there are failing CI checks on main.
- Don't modify application logic — only version numbers, changelogs, checksums.
- Don't release multiple skills in a single commit — one commit per skill release.
- Don't release if no new work exists since the last tag.

## Heartbeat (every tick)

At the end of each tick, write the heartbeat file with the Write tool:
- Path: `../../.claude/state/releaser.heartbeat.json`
- Content: `{"role":"releaser","lastIteration":"<UTC now>","lastExitCode":0,"pid":<current PID>,"startedAt":"<preserved from read, or UTC now on first tick>"}`
- Use `date -u +%Y-%m-%dT%H:%M:%SZ` for UTC timestamps.
- Preserve `startedAt` from the heartbeat read at tick start. Set to current UTC time on first tick.
