# 🐙 GitHub Fork Intelligence

> **Ask forks questions in plain English**

Scan every fork of any GitHub repository and ask the diffs questions like:
- *"Does any fork implement a web browser?"*
- *"Which forks added dark mode?"*
- *"Did any fork fix the memory leak?"*

Each fork's diff gets analyzed and returns `{ matches, reasoning }` grounded in actual code changes.

**Quick jump from GitHub:** On any repository page, replace `github.com` in your browser’s address bar with `forks-github.devliv.io` and keep the rest of the URL (`/owner/repo` and beyond). You land here ready to scan that repo’s forks.

## ✨ Features

🚀 **Discovery** — Pulls every fork of a repo from the GitHub API, capped at the first 50 by score, paginated  
📊 **Diff extraction** — Compares each fork to upstream, stores the patch and top changed files. Forks with zero commits ahead are recorded but skipped  
🏆 **Ranking** — Composite score per fork: commits ahead, lines changed, recency, stars  
🤖 **Ask** — Natural-language trait detection. Ask *"does this fork implement X?"* and every meaningful fork's diff gets classified in a bounded parallel loop. Each verdict is a `{ matches, reasoning }` grounded in actual diff/commit evidence. Streams results back over SSE as they complete

## 🏗️ Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system architecture and data flow diagrams.

## 🛠️ Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **PocketBase** (remote) — the only data store; holds `scans`, `forks`, `diffs`
- **OpenAI gpt-4o-mini** (JSON mode) for trait classification
- **GitHub API** via `@octokit/rest` + `p-queue` for rate-limit-bounded fan-out
- **Tailwind** CSS with dark Primer-ish palette
- **Bun** for install/build/test — never npm/npx

## 🔧 Installation

### Local Development

```bash
cp .env.local.example .env.local        # then fill in the values below
bun install
bun run dev                              # http://localhost:3000
```

### Required Environment Variables

All env vars are read at runtime — no build-time secrets:

- `GITHUB_TOKEN` — personal access token, public-repo scope is enough
- `OPENAI_API_KEY`
- `POCKETBASE_URL` — e.g. `http://localhost:8090` or your hosted PB
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`

### Database Setup

First time against a fresh PocketBase: `bun run scripts/import-full-schema.ts`
to create the `scans` / `forks` / `diffs` collections with the right field
constraints (notably `diffs.patch` needs `max: 60000` — PocketBase's silent
5,000-char default truncates every real diff otherwise).

## 🚀 Quick Start

```bash
# Start the development server
bun run dev                              # http://localhost:3000

# Run tests
bun test

# Import PocketBase schema (first time only)
bun run scripts/import-full-schema.ts
```

## 📡 API

See [docs/API.md](docs/API.md) for complete API reference.

## 🧪 Testing

See [docs/TESTING.md](docs/TESTING.md) for test suite details.

## 🚀 Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment instructions.

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Bug fixes** — Fix issues or improve existing features
2. **New features** — Add new capabilities to the fork analysis
3. **Documentation** — Improve the README or add examples
4. **Tests** — Add or improve test coverage

## 📝 License

MIT License — Use freely, modify as needed, contribute back if you can!

## 🙋 Support

- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Ask questions in GitHub Discussions

---

<div align="center">

**Made with ❤️ for developers**

Live at **[forks-github.devliv.io](https://forks-github.devliv.io)**

[⭐ Star this repo](../../) if it helps you!

</div>
