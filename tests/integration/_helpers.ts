// Shared helpers for integration tests. These tests hit a running dev server
// at TEST_BASE_URL (default http://localhost:3000) and skip gracefully when
// the server is unreachable or required env vars are missing.

export const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
export const TEST_SCAN_ID = process.env.TEST_SCAN_ID;

export async function isServerUp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(BASE_URL, { signal: controller.signal });
    clearTimeout(timer);
    return response.status < 500;
  } catch {
    return false;
  }
}

// Parses an SSE byte stream into [{ event, data }] frames. Reads the whole
// stream to completion — appropriate for short-lived endpoints like /ask.
export async function readSseStream(
  response: Response
): Promise<Array<{ event: string; data: unknown }>> {
  if (!response.body) throw new Error("response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ event: string; data: unknown }> = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line (\n\n).
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      let event = "message";
      let dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }

      if (dataLines.length > 0) {
        const dataText = dataLines.join("\n");
        try {
          events.push({ event, data: JSON.parse(dataText) });
        } catch {
          events.push({ event, data: dataText });
        }
      }

      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  return events;
}
