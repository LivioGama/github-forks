# Claude Code Preferences

## Package Manager
- **MUST use `bun`** - Do not use `npm`, `yarn`, or `pnpm`
- All install, build, and development commands must use `bun`
- If bun has issues, troubleshoot with bun—do not fall back to npm

## Build and Development
- `bun install` - Install dependencies
- `bun run build` - Production build (see **Build policy** below)
- `bun run dev` - Development server

## Build policy
- **Do not run `bun run build`** unless the user **explicitly** asks to build, verify the build, or fix CI. Prefer lints/diagnostics instead of full builds by default.

## Important Constraints
- This project uses better-sqlite3 which requires native C++ compilation
- System compiler may lack C++20 support—use Docker for builds if local compilation fails
- Enforce bun usage across all agent tasks

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
