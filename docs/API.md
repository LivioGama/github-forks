# 📡 API Reference

## Endpoints

### Scan Management

#### POST /api/scan
Start a new scan for a repository.

**Request Body:**
```json
{
  "owner": "string",
  "repo": "string",
  "force": "boolean" // optional
}
```

**Response:**
```json
{
  "jobId": "string"
}
```

#### GET /api/scan/:id
Get current scan state and top forks.

**Response:**
```json
{
  "scan": {
    "id": "string",
    "status": "string",
    "progress": "number",
    "totalForks": "number",
    "processedForks": "number"
  },
  "topForks": []
}
```

#### GET /api/scan/:id/status
SSE progress stream for real-time scan updates.

**Events:**
- `start` — Scan started
- `progress` — Progress update
- `complete` — Scan finished
- `error` — Scan failed

### Fork Queries

#### GET /api/forks/top
Get top forks for a scan.

**Query Parameters:**
- `scanId` — Scan ID
- `limit` — Number of results (optional)

**Response:**
```json
{
  "forks": []
}
```

#### GET /api/forks/:owner/:repo/diff-summary
Get diff summary for a specific fork.

**Query Parameters:**
- `scanId` — Scan ID

**Response:**
```json
{
  "patch": "string",
  "topFiles": [],
  "commits": []
}
```

#### GET /api/forks/ask
Ask a natural-language question about forks.

**Query Parameters:**
- `scanId` — Scan ID
- `q` — Question (500-char cap)

**Response:** SSE stream of per-fork classifier verdicts.

**Rate Limiting:**
- 10 requests per minute per IP
- 5-minute result cache by `(scanId, normalized question)`

**Response Format:**
```json
{
  "matches": "boolean",
  "reasoning": "string",
  "forkId": "string"
}
```
