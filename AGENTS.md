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
