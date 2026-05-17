# 🧪 Testing

## Running Tests

```bash
bun test                                 # zero-dep, uses `bun:test`
```

## Integration Tests

Three integration tests live in `tests/integration/`. They require a running
dev server (probed via fetch) and `TEST_SCAN_ID` env var pointing at a
completed scan in your PocketBase. They skip gracefully — with a printed
reason — when either is missing.

### Test Suite

- **scan-autocancel.test.ts** — 30 parallel GETs to `/api/scan/:id` to regress
  the PocketBase auto-cancel race
- **diff-summary.test.ts** — full scan-and-fetch loop against the tokenizer
  repo to regress the JSON-field double-encode fix
- **ask-sse.test.ts** — parses the ASK SSE stream manually and asserts the
  start/result/done event shapes

### Running Integration Tests

```bash
# Set the scan ID for a completed scan
export TEST_SCAN_ID="your-scan-id"

# Run the tests
bun test tests/integration/
```

## Test Coverage

The test suite covers:
- API endpoint functionality
- PocketBase integration
- SSE streaming
- Error handling
- Rate limiting
