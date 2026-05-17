# 🚀 Deployment

## Dokploy Deployment

The primary deployment target is **Dokploy** using the provided Docker Compose configuration.

### Setup

1. **Configure Environment Variables**
   ```bash
   # Copy the example env file
   cp .env.local.example .env.local
   
   # Fill in the required values:
   # - GITHUB_TOKEN
   # - OPENAI_API_KEY
   # - POCKETBASE_URL
   # - POCKETBASE_ADMIN_EMAIL
   # - POCKETBASE_ADMIN_PASSWORD
   ```

2. **Deploy with Dokploy**
   ```bash
   # Use the provided Docker Compose configuration
   docker-compose -f docker-compose.dokploy.yml up -d
   ```

3. **Run Setup Script**
   ```bash
   ./deploy-dokploy.sh
   ```

### Environment Variables

All env vars are read at runtime — no build-time secrets:

- `GITHUB_TOKEN` — personal access token, public-repo scope is enough
- `OPENAI_API_KEY`
- `POCKETBASE_URL` — e.g. `http://localhost:8090` or your hosted PB
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`

### PocketBase: add Gemini / commit fields (remote)

The migration script must use your **public** PocketBase URL (from `.env.local`), not the Docker-internal `http://pocketbase:8090` from `.env.production`. The script loads `.env.local` **last with override** so `POCKETBASE_URL` wins.

```bash
bun install   # ensures @dokploy/cli for deploy script
bun run pb:add-fork-gemini-fields
```

### Dokploy CLI

The CLI is a **devDependency** (`@dokploy/cli`). Use it from the repo root:

```bash
bun run dokploy -- --help
bun run dokploy -- auth    # point at your Dokploy server once
bun run dokploy -- project list
bun run dokploy -- compose read-logs <composeId>
```

Deploy/redeploy the Next app stack:

```bash
./deploy-dokploy.sh
```

That script prefers `dokploy` on `PATH`, then `node_modules/.bin/dokploy`, then `bunx dokploy`.

### Database Setup

First time against a fresh PocketBase:
```bash
bun run scripts/import-full-schema.ts
```

This creates the `scans` / `forks` / `diffs` collections with the right field
constraints (notably `diffs.patch` needs `max: 60000` — PocketBase's silent
5,000-char default truncates every real diff otherwise).
