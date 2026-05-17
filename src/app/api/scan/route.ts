import { NextRequest, NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import { runScanPipeline } from "@/lib/workers/pipeline";
import { respondWithError } from "@/lib/api/respond";
import { errorMessage } from "@/lib/errors";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// The scan pipeline (forkDiscovery + diffExtraction + ranking) can take a
// few minutes on a 50-fork repo. Vercel serverless terminates the
// function the instant the HTTP response is sent — `void runPipeline()`
// from a regular handler gets cut off mid-loop. `after()` extends the
// invocation past the response under Vercel's Fluid Compute, up to
// `maxDuration`. Requires Vercel Pro (Hobby caps at 10–25s).
export const maxDuration = 800;

interface ScanRequest {
  owner?: string;
  repo?: string;
  upstreamBranch?: string;
  keywords?: string[];
  maxForks?: number;
  force?: boolean;
  githubToken?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ScanRequest;
    const { owner, repo, upstreamBranch, keywords, maxForks, force = false, githubToken } = body;

    if (!owner || !repo) {
      return NextResponse.json({ error: "owner and repo are required" }, { status: 400 });
    }

    try {
      const database = await getDb();
      
      if (!force) {
        const existingScans = await database.collection('scans').getList(1, 1, {
          filter: `owner = "${owner}" && repo = "${repo}" && status = "completed"`,
          sort: '-startedAt',
        });

        if (existingScans.items.length > 0) {
          const existingScan = existingScans.items[0];
          return NextResponse.json({
            jobId: existingScan.id,
            existing: true
          }, { status: 200 });
        }
      }

      const result = await database.collection('scans').create({
        owner,
        repo,
        status: 'pending',
        keywords: keywords ? JSON.stringify(keywords) : null,
        startedAt: new Date().toISOString(),
      });
      const scanId = result.id;

      // `after()` runs after the response is sent and keeps the function
      // alive (under Fluid Compute) until `maxDuration`. The previous
      // `queueMicrotask(() => void runScanPipeline(...))` pattern looked
      // like fire-and-forget but Vercel terminated the function on
      // return — leaving scans stuck at processedForks=0.
      after(async () => {
        try {
          await runScanPipeline(scanId, { owner, repo, upstreamBranch, keywords, maxForks, githubToken });
        } catch (err) {
          console.error("Scan pipeline error:", err);
        }
      });

      return NextResponse.json({ jobId: scanId, existing: false }, { status: 202 });
    } catch (dbError: unknown) {
      console.error("Database insert error:", dbError);
      return NextResponse.json(
        { error: `Database error: ${errorMessage(dbError)}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Scan route error:", error);
    return respondWithError(error);
  }
}
