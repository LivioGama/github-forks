#!/bin/bash
set -e

# Resolve dokploy: prefer PATH, then project devDependency, then bunx.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
if command -v dokploy &> /dev/null; then
  DOKPLOY=(dokploy)
elif [[ -x "$SCRIPT_DIR/node_modules/.bin/dokploy" ]]; then
  DOKPLOY=("$SCRIPT_DIR/node_modules/.bin/dokploy")
else
  DOKPLOY=(bunx dokploy)
fi

# Dokploy deployment script for liviogama project
# Usage: ./deploy-dokploy.sh

PROJECT="liviogama"
STACK="github-forks"
COMPOSE_FILE="docker-compose.dokploy.yml"
ENV_FILE=".env.production"

echo "🚀 Preparing deployment to dokploy (project: $PROJECT)"

# Check required env vars
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN not set"
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ OPENAI_API_KEY not set"
  exit 1
fi

if [ -z "$POCKETBASE_ADMIN_EMAIL" ]; then
  echo "❌ POCKETBASE_ADMIN_EMAIL not set"
  exit 1
fi

if [ -z "$POCKETBASE_ADMIN_PASSWORD" ]; then
  echo "❌ POCKETBASE_ADMIN_PASSWORD not set"
  exit 1
fi

# Check dokploy can run (bunx fallback needs bun)
if [[ "${DOKPLOY[0]}" == "bunx" ]] && ! command -v bun &> /dev/null; then
  echo "❌ bun is required to run bunx dokploy (or install dokploy on PATH / run bun install)."
  exit 1
fi

# Create env file if doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo "📝 Creating $ENV_FILE..."
  cat > "$ENV_FILE" << EOF
GITHUB_TOKEN=$GITHUB_TOKEN
OPENAI_API_KEY=$OPENAI_API_KEY
POCKETBASE_URL=http://pocketbase:8090
POCKETBASE_ADMIN_EMAIL=$POCKETBASE_ADMIN_EMAIL
POCKETBASE_ADMIN_PASSWORD=$POCKETBASE_ADMIN_PASSWORD
NODE_ENV=production
EOF
  echo "✓ Created $ENV_FILE"
fi

# Get or create project
echo "🔍 Getting project ID..."
PROJECT_ID=$("${DOKPLOY[@]}" project list --json | grep -o "\"id\":\"[^\"]*\",\"name\":\"$PROJECT\"" | cut -d'"' -f2)

if [ -z "$PROJECT_ID" ]; then
  echo "📝 Creating project: $PROJECT..."
  PROJECT_ID=$("${DOKPLOY[@]}" project create \
    --name "$PROJECT" \
    --description "GitHub Fork Intelligence Engine" \
    --json | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  echo "✓ Created project: $PROJECT (ID: $PROJECT_ID)"
else
  echo "✓ Project ID: $PROJECT_ID"
fi

# Get or create compose service
echo "🔍 Checking for existing compose service..."
COMPOSE_ID=$("${DOKPLOY[@]}" compose list --json | grep -o "\"id\":\"[^\"]*\",\"name\":\"$STACK\"" | cut -d'"' -f2)

if [ -z "$COMPOSE_ID" ]; then
  echo "📝 Creating new compose service (you'll need to paste the compose file in the dashboard)..."
  COMPOSE_ID=$("${DOKPLOY[@]}" compose create \
    --project "$PROJECT_ID" \
    --name "$STACK" \
    --type "docker-compose" \
    --json | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
  echo "✓ Created compose service: $COMPOSE_ID"
  echo ""
  echo "⚠️  IMPORTANT: You need to complete the setup in the Dokploy dashboard:"
  echo "   1. Open the compose service: $STACK"
  echo "   2. Paste the contents of $COMPOSE_FILE into the compose file field"
  echo "   3. Add environment variables from $ENV_FILE"
  echo "   4. Then run: ${DOKPLOY[*]} compose deploy $COMPOSE_ID"
else
  echo "✓ Found existing compose service: $COMPOSE_ID"
  echo "⏳ Redeploying..."
  "${DOKPLOY[@]}" compose redeploy "$COMPOSE_ID"
fi

echo ""
echo "✅ Deployment preparation complete!"
echo ""
echo "Next steps:"
echo "  1. Open dokploy dashboard"
echo "  2. Go to project: $PROJECT"
echo "  3. Find compose service: $STACK (ID: $COMPOSE_ID)"
echo "  4. Configure domain: forks-github-pocketbase.devliv.io (port 8090)"
echo "  5. Check logs: ${DOKPLOY[*]} compose read-logs $COMPOSE_ID"
echo "  6. Access PocketBase admin: https://forks-github-pocketbase.devliv.io/_/"
