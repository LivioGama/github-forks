import { NextRequest, NextResponse } from "next/server";
import { getJobEmitter, formatProgressPayload, JobState } from "@/lib/queue/jobQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  const encoder = new TextEncoder();
  const emitter = getJobEmitter(jobId);

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ jobId, status: "connected" });

      const onProgress = (progress: JobState) => send(formatProgressPayload(progress));
      emitter.on("progress", onProgress);

      request.signal.addEventListener("abort", () => {
        emitter.off("progress", onProgress);
        controller.close();
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
