import { describe, it, expect } from "bun:test";
import { BASE_URL, TEST_SCAN_ID, isServerUp } from "./_helpers";

// Regression for the PocketBase auto-cancel race: getDb() is a singleton
// client, so concurrent SWR polls to /api/scan/[id] used to collide on
// requestKey and one of every pair was aborted, surfacing as a 500.
//
// Requires:
//   - dev server running at TEST_BASE_URL (default http://localhost:3000)
//   - TEST_SCAN_ID pointing at any completed scan id

// Top-level await so it.skipIf() sees the actual probe result. beforeAll
// runs AFTER skipIf is evaluated and would leave every test silently
// skipped.
const serverUp = await isServerUp();
if (!serverUp) console.log("[scan-autocancel] dev server unreachable — tests will skip");
if (!TEST_SCAN_ID) console.log("[scan-autocancel] TEST_SCAN_ID unset — tests will skip");

describe("/api/scan/[id] survives concurrent requests", () => {
  it.skipIf(!TEST_SCAN_ID || !serverUp)(
    "30 parallel GETs all return 200",
    async () => {
      const requests = Array.from({ length: 30 }, () =>
        fetch(`${BASE_URL}/api/scan/${TEST_SCAN_ID}`)
      );
      const responses = await Promise.all(requests);

      // 30 expect calls — one per request. If any single one races into a
      // PocketBase auto-cancel abort, this test catches it.
      for (const response of responses) {
        expect(response.status).toBe(200);
      }
    },
    30000
  );

  it.skipIf(!serverUp || !TEST_SCAN_ID)("response shape is intact under load", async () => {
    const response = await fetch(`${BASE_URL}/api/scan/${TEST_SCAN_ID}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { scan?: { status?: string } };
    expect(body.scan).toBeDefined();
    expect(typeof body.scan?.status).toBe("string");
  });
});
