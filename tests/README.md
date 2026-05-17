# Tests

This directory contains integration tests for the github-forks project.

## Running Tests

```bash
bun test
```

## Test Structure

- `integration/` - Integration tests that require database access
  - `scan-autocancel.test.ts` - Tests NO_CANCEL pattern for concurrent PocketBase requests
  - `diff-summary.test.ts` - Tests parseJsonArray handling of JSON fields
  - `ask-sse.test.ts` - Tests ASK SSE endpoint structure and parameter parsing

## Setup

Tests require PocketBase to be running and accessible via the `POCKETBASE_URL` environment variable.

The tests use the production database but clean up after themselves.
