#!/bin/bash
set -e

# Dokploy API deployment
# Requires: DOKPLOY_URL, DOKPLOY_TOKEN, GITHUB_TOKEN, OPENAI_API_KEY

DOKPLOY_URL="${DOKPLOY_URL:-http://localhost:3000}"
PROJECT="liviogama"
STACK="github-forks"
COMPOSE_FILE="docker-compose.yml"

echo "🚀 Deploying to dokploy API: $DOKPLOY_URL"

# Validate env
required_vars=(DOKPLOY_TOKEN GITHUB_TOKEN OPENAI_API_KEY)
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ $var not set"
    exit 1
  fi
done

# Get project ID
echo "📋 Looking up project: $PROJECT"
PROJECT_ID=$(curl -s -H "Authorization: Bearer $DOKPLOY_TOKEN" \
  "$DOKPLOY_URL/api/projects" | \
  jq -r ".[] | select(.name==\"$PROJECT\") | .id" | head -1)

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Project not found: $PROJECT"
  exit 1
fi

echo "✓ Found project: $PROJECT_ID"

# Create or update stack
echo "📦 Creating/updating stack: $STACK"

COMPOSE_CONTENT=$(cat "$COMPOSE_FILE" | jq -Rs .)

STACK_PAYLOAD=$(jq -n \
  --arg name "$STACK" \
  --arg projectId "$PROJECT_ID" \
  --arg compose "$COMPOSE_CONTENT" \
  '{
    name: $name,
    projectId: $projectId,
    composeFile: $compose
  }')

# Create stack (or update if exists)
curl -s -X POST \
  -H "Authorization: Bearer $DOKPLOY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$STACK_PAYLOAD" \
  "$DOKPLOY_URL/api/stacks" | jq .

echo ""
echo "✅ Stack created/updated!"
echo ""
echo "Set environment variables:"
echo "  dokploy env set $STACK GITHUB_TOKEN $GITHUB_TOKEN"
echo "  dokploy env set $STACK OPENAI_API_KEY $OPENAI_API_KEY"
echo ""
echo "Deploy:"
echo "  dokploy deploy $STACK"
