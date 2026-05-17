FROM node:20-slim AS builder

WORKDIR /app

ENV PATH="/root/.bun/bin:${PATH}"

# Build deps + bun installer
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl ca-certificates unzip \
    && curl -fsSL https://bun.sh/install | bash \
    && rm -rf /var/lib/apt/lists/*

# Install node-gyp globally via bun for native module compilation
RUN bun install -g node-gyp

# Copy package files and lock
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build Next.js with Node
RUN node node_modules/.bin/next build

# Production stage
FROM node:20-slim

WORKDIR /app

# Create data directory for SQLite
RUN mkdir -p data

# Copy built app from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json

# Expose port
EXPOSE 3000

# Start server with Node
CMD ["node", "node_modules/.bin/next", "start"]
