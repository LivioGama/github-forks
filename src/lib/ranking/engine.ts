import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { updateJobProgress } from "@/lib/queue/jobQueue";
import { errorMessage } from "@/lib/errors";

interface Fork {
  id: string;
  stage: string;
  aheadBy: number;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  stars: number;
  updatedAt: string;
}

const AHEAD_BY_SATURATION = 100;
const LINES_CHANGED_SATURATION = 5000;
const RECENCY_DAYS_HORIZON = 365;
const STARS_SATURATION = 1000;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DB_FLUSH_INTERVAL = 10;

const DEFAULT_WEIGHTS = {
  aheadBy: 0.375,
  linesChanged: 0.25,
  recency: 0.25,
  stars: 0.125,
};

interface RankingFactors {
  aheadBy: number;
  linesChanged: number;
  recencyDays: number;
  stars: number;
}

export function computeScore(
  factors: RankingFactors,
  weights: Partial<typeof DEFAULT_WEIGHTS> = {}
): number {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const normalized = {
    aheadBy: Math.min(factors.aheadBy / AHEAD_BY_SATURATION, 1),
    linesChanged: Math.min(factors.linesChanged / LINES_CHANGED_SATURATION, 1),
    recency: Math.max(0, 1 - factors.recencyDays / RECENCY_DAYS_HORIZON),
    stars: Math.min(factors.stars / STARS_SATURATION, 1),
  };

  return (
    normalized.aheadBy * w.aheadBy +
    normalized.linesChanged * w.linesChanged +
    normalized.recency * w.recency +
    normalized.stars * w.stars
  );
}

export async function rankingWorker(scanId: string): Promise<void> {
  const database = await getDb();
  try {
    // PB_NO_CANCEL is critical here: getFullList paginates internally and each
    // page request inherits the same auto-generated requestKey, so the SDK
    // auto-cancels its own earlier page mid-fetch and the whole call hangs.
    // That's what stalled ranking on Vercel post-diffExtraction (50-minute
    // hang, scan stuck at processedForks=13/13). Every PB call in the
    // pipeline must opt out of auto-cancellation.
    const forks = (await database.collection('forks').getFullList({
      ...PB_NO_CANCEL,
      filter: `scanId = "${scanId}" && stage != "completed"`,
    })) as unknown as Fork[];

    const totalForks = forks.length;

    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "ranking",
      progress: 0,
      message: "Computing fork scores...",
      processedCount: 0,
      totalCount: totalForks,
    });

    const now = Date.now();

    for (let i = 0; i < forks.length; i++) {
      const fork = forks[i];
      const count = i + 1;
      const shouldFlush = count % DB_FLUSH_INTERVAL === 0 || count === totalForks;

      if (fork.stage === "ranking" || fork.stage === "completed") {
        updateJobProgress(scanId, {
          jobId: scanId,
          stage: "ranking",
          progress: Math.round((count / totalForks) * 100),
          message: `Skipped ${count}/${totalForks} (already ranked)`,
          processedCount: count,
          totalCount: totalForks,
        });
        if (shouldFlush) {
          await database.collection('scans').update(scanId, { processedForks: count }, PB_NO_CANCEL);
        }
        continue;
      }

      const recencyDays = fork.updatedAt
        ? (now - new Date(fork.updatedAt).getTime()) / MS_PER_DAY
        : RECENCY_DAYS_HORIZON;

      const score = computeScore({
        aheadBy: fork.aheadBy ?? 0,
        linesChanged: (fork.linesAdded ?? 0) + (fork.linesRemoved ?? 0),
        recencyDays,
        stars: fork.stars ?? 0,
      });

      await database.collection('forks').update(fork.id, {
        score,
        summary: summarizeFork(fork),
        stage: "ranking",
      }, PB_NO_CANCEL);

      updateJobProgress(scanId, {
        jobId: scanId,
        stage: "ranking",
        progress: Math.round((count / totalForks) * 100),
        message: `Ranked ${count}/${totalForks} forks`,
        processedCount: count,
        totalCount: totalForks,
      });

      if (shouldFlush) {
        await database.collection('scans').update(scanId, { processedForks: count }, PB_NO_CANCEL);
      }
    }

    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "ranking",
      progress: 100,
      message: "Ranking complete",
      processedCount: totalForks,
      totalCount: totalForks,
    });
  } catch (error) {
    await database.collection('scans').update(scanId, {
      status: "failed",
      error: errorMessage(error),
    }, PB_NO_CANCEL);
    throw error;
  }
}

function summarizeFork(fork: Fork): string {
  const parts: string[] = [];

  if (fork.aheadBy > 0) parts.push(`${fork.aheadBy} commits ahead`);
  if (fork.filesChanged > 0) parts.push(`${fork.filesChanged} files changed`);

  const linesChanged = (fork.linesAdded ?? 0) + (fork.linesRemoved ?? 0);
  if (linesChanged > 0) parts.push(`${linesChanged} lines modified`);

  if (fork.stars > 0) parts.push(`${fork.stars} stars`);

  return parts.join(", ") || "No significant changes";
}
