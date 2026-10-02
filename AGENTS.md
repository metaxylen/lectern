<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:lectern-git-sync -->

## Git: commit and push after code changes

When this session **changes project files** (even a one-line fix), finish with **commit + push** unless the user explicitly says not to (e.g. “don’t commit”, “WIP only”).

### Workflow

1. After edits are done and checks pass when reasonable (`typecheck` / `test` for non-trivial changes), stage only project files (never `.env`, secrets, or local machine paths).
2. Write a short, honest commit message describing **why** (one logical unit of work per commit).
3. Push to the configured remote (`github` → `metaxylen/lectern`, branch `main` unless the user names another branch).

### Do not


- **Force-push** `main`, skip hooks, or amend pushed commits unless the user asks and git safety rules allow it.
- Commit credentials, `.env.local`, or whisper model binaries.

### Grouping

Prefer **one commit per completed user request or coherent fix**, not one commit per line. If a single task touches many files, one commit is fine. Split only when the user asked for separate PRs or the diff is clearly two unrelated features.

<!-- END:lectern-git-sync -->

<!-- BEGIN:lectern-superskills -->

## Superskills: use and report

When work is non-trivial, **read and follow** the matching skill from `~/.cursor/skills/<name>/SKILL.md` (superskills). Pick one primary skill per step; combine with project `AGENTS.md`, not instead of it.

| Situation | Skill (examples) |
|-----------|------------------|
| Vague “what should we build?” | `brainstorming` → `writing-plans` |
| Implement a planned feature | `incremental-implementation` or `executing-plans` |
| Bug / failure | `systematic-debugging` |
| Before claiming done | `verification-before-completion` |
| Commit / push / ship | `git-workflow-and-versioning` |
| Skills meta / routing | `using-agent-skills` |
| Edit this file or a skill | `writing-for-agents` |

After each reply where a skill was used, add a short block for the user (Turkish or English, match the user):

```
### Superskills bu turda
- **<skill>**: <one sentence — what you did because of it>
```

If no skill body was read this turn, write: `### Superskills bu turda` — *(bu turda skill dosyası okunmadı; sadece AGENTS.md / genel kurallar.)*

Do not name a skill you did not actually read in that turn.

<!-- END:lectern-superskills -->
