import { describe, it, expect } from "bun:test";
import { BASE_URL, isServerUp } from "./_helpers";

// Regression for the JSON-field double-encode fix: previously, diff-extraction
// wrote `JSON.stringify(topFiles)` (a string) into the PocketBase `json` field,
// and the read path JSON.parse'd it again — but PocketBase returns parsed
// arrays from json fields, so JSON.parse on an array threw and the result was
// silently swallowed to [].
//
// This test runs a real scan against a small, stable repo
// (anthropics/anthropic-tokenizer-typescript, ~13 forks, exactly one ahead of
// upstream — `jimsproull`). It then asserts that the diff-summary endpoint
// returns non-empty topFiles AND commits arrays for that fork.

const TEST_OWNER = "anthropics";
const TEST_REPO = "anthropic-tokenizer-typescript";
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 90_000;

interface ScanPostResponse {
  jobId: string;
}

interface Fork {
  owner: string;
  repo: string;
  aheadBy: number;
}

interface ScanGetResponse {
  scan: { status: string };
  topForks: Fork[];
}

interface DiffSummaryResponse {
  diff: {
    status: string;
    topFiles: unknown[];
    commits: unknown[];
  };
}

async function poll<T>(fn: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`poll timed out after ${timeoutMs}ms`);
}

// See scan-autocancel.test.ts for why top-level await is needed.
const serverUp = await isServerUp();
if (!serverUp) console.log("[diff-summary] dev server unreachable — tests will skip");

describe("diff-summary returns populated topFiles + commits for extracted diffs", () => {
  it.skipIf(!serverUp)(
    "fresh scan of anthropic-tokenizer-typescript surfaces a real diff",
    async () => {
      // Force a fresh scan so we exercise the current write path, not any
      // legacy data persisted before the JSON-field fix.
      const startResponse = await fetch(`${BASE_URL}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: TEST_OWNER, repo: TEST_REPO, force: true }),
      });
      expect(startResponse.status).toBeLessThan(300);

      const { jobId } = (await startResponse.json()) as ScanPostResponse;
      expect(typeof jobId).toBe("string");
      expect(jobId.length).toBeGreaterThan(0);

      const completed = await poll<ScanGetResponse>(async () => {
        const response = await fetch(`${BASE_URL}/api/scan/${jobId}`);
        if (!response.ok) return null;
        const body = (await response.json()) as ScanGetResponse;
        if (body.scan.status === "completed") return body;
        if (body.scan.status === "failed") {
          throw new Error("scan failed during polling");
        }
        return null;
      }, POLL_TIMEOUT_MS);

      expect(completed.scan.status).toBe("completed");
      expect(completed.topForks.length).toBeGreaterThan(0);

      const meaningful = completed.topForks.find((fork) => fork.aheadBy > 0);
      expect(meaningful).toBeDefined();
      if (!meaningful) return; // unreachable, satisfies TS

      const summaryResponse = await fetch(
        `${BASE_URL}/api/forks/${meaningful.owner}/${meaningful.repo}/diff-summary?scanId=${jobId}`
      );
      expect(summaryResponse.status).toBe(200);

      const summary = (await summaryResponse.json()) as DiffSummaryResponse;

      // The actual regression assertions:
      expect(summary.diff.status).toBe("extracted");
      expect(summary.diff.topFiles.length).toBeGreaterThan(0);
      expect(summary.diff.commits.length).toBeGreaterThan(0);
    },
    POLL_TIMEOUT_MS + 30_000
  );
});
