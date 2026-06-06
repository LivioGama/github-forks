# Agent Guidelines for github-forks

## Mandatory Package Manager
- **ALWAYS use `bun`** for all package management operations
- **NEVER use npm, yarn, pnpm, or any other package manager**
- This is a hard constraint and must be enforced in all agent work

## Commands
- Dependencies: `bun install`
- Build: `bun run build` (see **Build policy** below)
- Development: `bun run dev`
- Other scripts: `bun run <script-name>`

## Build policy
- **Do not run `bun run build`** (or other full production builds) unless the **user explicitly asks** to build, verify the build, or fix a failing CI build.
- Prefer `read_lints`/editor diagnostics or targeted checks; avoid long build runs as a default verification step.

## When bun Fails
- Troubleshoot the bun-specific issue
- Do not switch to npm as a workaround
- Escalate to the user if bun cannot be resolved
- Document the issue for later debugging

## Native Module Compilation
- better-sqlite3 requires C++20 compiler support
- Local compilation may fail on systems without modern C++ support
- Docker environment has proper build tooling
- Use Docker `npm run build` only if local bun build absolutely fails

## Git Workflow Rules
- **ALWAYS make changes locally, then amend commit and force push**
- Never push directly to remote without local commit
- Use `git commit --amend` to modify the most recent commit
- Use `git push --force` after amending to update remote
- **After each change, commit and squash all repo commits into a single one then force push**
- This ensures clean commit history and proper tracking

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **github-forks** (1018 symbols, 1514 relationships, 54 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/github-forks/context` | Codebase overview, check index freshness |
| `gitnexus://repo/github-forks/clusters` | All functional areas |
| `gitnexus://repo/github-forks/processes` | All execution flows |
| `gitnexus://repo/github-forks/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
