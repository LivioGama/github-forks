import { describe, it, expect } from "bun:test";
import { BASE_URL, TEST_SCAN_ID, isServerUp, readSseStream } from "./_helpers";

// Regression for the ASK endpoint contract. The endpoint streams server-sent
// events: exactly one `start`, N `result` events (N === start.total), and
// exactly one `done`. EventSource is browser-only, so we drive the stream
// manually via fetch + ReadableStream and parse SSE frames by hand
// (see _helpers.readSseStream).
//
// Requires:
//   - dev server running at TEST_BASE_URL
//   - TEST_SCAN_ID pointing at a completed scan with ≥1 fork ahead of
//     upstream (so the loop actually runs and emits result events)

const ASK_TIMEOUT_MS = 60_000;

// See scan-autocancel.test.ts for why top-level await is needed.
const serverUp = await isServerUp();
if (!serverUp) console.log("[ask-sse] dev server unreachable — tests will skip");
if (!TEST_SCAN_ID) console.log("[ask-sse] TEST_SCAN_ID unset — main test will skip");

describe("/api/forks/ask SSE stream", () => {
  it.skipIf(!TEST_SCAN_ID || !serverUp)(
    "emits exactly one start, N result, one done — with the expected shapes",
    async () => {
      const url = `${BASE_URL}/api/forks/ask?scanId=${encodeURIComponent(
        TEST_SCAN_ID as string
      )}&q=${encodeURIComponent("test")}`;

      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const events = await readSseStream(response);

      const startEvents = events.filter((event) => event.event === "start");
      const resultEvents = events.filter((event) => event.event === "result");
      const doneEvents = events.filter((event) => event.event === "done");

      // Exactly one start, exactly one done.
      expect(startEvents.length).toBe(1);
      expect(doneEvents.length).toBe(1);

      // start payload shape
      const startData = startEvents[0].data as { total: number; question: string };
      expect(typeof startData.total).toBe("number");
      expect(typeof startData.question).toBe("string");
      expect(startData.question).toBe("test");

      // N result events, where N === start.total
      expect(resultEvents.length).toBe(startData.total);

      // Every result has the right shape
      for (const event of resultEvents) {
        const result = event.data as {
          owner: unknown;
          repo: unknown;
          matches: unknown;
          reasoning: unknown;
          completed: unknown;
          total: unknown;
        };
        expect(typeof result.owner).toBe("string");
        expect(typeof result.repo).toBe("string");
        expect(typeof result.matches).toBe("boolean");
        expect(typeof result.reasoning).toBe("string");
        expect(typeof result.completed).toBe("number");
        expect(typeof result.total).toBe("number");
      }

      // done payload shape
      const doneData = doneEvents[0].data as { matched: number; total: number };
      expect(typeof doneData.matched).toBe("number");
      expect(typeof doneData.total).toBe("number");
      expect(doneData.total).toBe(startData.total);
    },
    ASK_TIMEOUT_MS
  );

  it.skipIf(!serverUp)("rejects requests with question over 500 chars", async () => {
    const longQuestion = "x".repeat(501);
    const url = `${BASE_URL}/api/forks/ask?scanId=anything&q=${encodeURIComponent(longQuestion)}`;
    const response = await fetch(url);
    expect(response.status).toBe(400);
  });

  it.skipIf(!serverUp)("rejects requests with missing scanId", async () => {
    const response = await fetch(`${BASE_URL}/api/forks/ask?q=test`);
    expect(response.status).toBe(400);
  });
});
