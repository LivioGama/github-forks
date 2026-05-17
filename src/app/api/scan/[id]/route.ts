import { NextRequest, NextResponse } from "next/server";
import type { RecordModel } from "pocketbase";
import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { getJobProgress } from "@/lib/queue/jobQueue";
import { respondWithError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

type ForkListRow = RecordModel & {
  owner: string;
  repo: string;
  stars: number;
  aheadBy: number;
  filesChanged: number;
  score: number;
  summary: string;
  deepSummary?: string | null;
  deepSummaryGeneratedAt?: string | null;
};

function isPbNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { status?: number }).status === 404;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const database = await getDb();

    const scanData = await database.collection('scans').getOne(id, PB_NO_CANCEL);

    // Return ALL forks with real changes (aheadBy > 0) so that "ask" can
    // semantically search every fork that has diffs, not just the highest-scoring
    // subset. Sorted by score for ranked display.
    const topForks = await database.collection('forks').getFullList({
      ...PB_NO_CANCEL,
      filter: `scanId = "${id}" && aheadBy > 0`,
      sort: '-score',
    });

    // In-memory state is more granular but lost on reload; DB is persistent fallback
    const jobProgress = getJobProgress(id);

    const totalForks = scanData.totalForks ?? 0;
    const processedForks = scanData.processedForks ?? 0;
    const progress = jobProgress?.progress
      ?? (totalForks > 0 ? Math.round((processedForks / totalForks) * 100) : 0);
    const message = jobProgress?.message
      ?? deriveMessage(scanData.status, totalForks, processedForks, scanData.error);

    return NextResponse.json({
      scan: {
        id: scanData.id,
        owner: scanData.owner,
        repo: scanData.repo,
        status: scanData.status,
        startedAt: scanData.startedAt,
        finishedAt: scanData.finishedAt,
        totalForks,
        processedForks,
        progress,
        message,
        error: scanData.error,
      },
      topForks: topForks.map((fork) => {
        const row = fork as ForkListRow;
        return {
          id: row.id,
          owner: row.owner,
          repo: row.repo,
          stars: row.stars,
          aheadBy: row.aheadBy,
          filesChanged: row.filesChanged,
          score: row.score,
          summary: row.summary,
          deepSummary: row.deepSummary ?? null,
          deepSummaryGeneratedAt: row.deepSummaryGeneratedAt ?? null,
        };
      }),
    });
  } catch (error: unknown) {
    if (isPbNotFound(error)) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    return respondWithError(error);
  }
}

function deriveMessage(
  status: string,
  totalForks: number,
  processedForks: number,
  error?: string
): string {
  if (status === "completed") return "Completed";
  if (status === "failed") return error || "Failed";
  if (status === "pending") return "Queued...";
  if (totalForks === 0) return "Discovering forks...";
  if (processedForks < totalForks) return `Processing ${processedForks}/${totalForks} forks...`;
  return "Finalizing...";
}
