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
