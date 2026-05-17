import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { fetchAllForks, DEFAULT_MAX_FORKS } from "@/lib/github/forks";
import { createQueue } from "@/lib/github/client";
import { updateJobProgress } from "@/lib/queue/jobQueue";
import { errorMessage } from "@/lib/errors";

export async function forkDiscoveryWorker(
  scanId: string,
  owner: string,
  repo: string,
  maxForks: number = DEFAULT_MAX_FORKS,
  githubToken?: string,
  keywords?: string[]
): Promise<{ usefulCount: number; upstreamDefaultBranch: string }> {
  const database = await getDb();
  const queue = createQueue();
  try {
    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "discovery",
      progress: 0,
      message: "Fetching forks...",
      processedCount: 0,
      totalCount: 0,
    });

    const { forks, totalRaw, upstreamDefaultBranch } = await fetchAllForks(
      owner,
      repo,
      queue,
      maxForks,
      async ({ checked, total, useful }) => {
        const progress = total > 0 ? Math.round((checked / total) * 80) : 0;
        updateJobProgress(scanId, {
          jobId: scanId,
          stage: "discovery",
          progress,
          message:
            useful > 0
              ? `Selected ${useful} top forks from ${checked}/${total}`
              : `Fetching ${checked}/${total} forks...`,
          processedCount: checked,
          totalCount: total,
        });
        await database.collection('scans').update(
          scanId,
          {
            processedForks: checked,
            totalForks: total,
          },
          PB_NO_CANCEL
        );
      },
      githubToken,
      keywords
    );

    const usefulCount = forks.length;

    // Reset counters for subsequent stages
    await database.collection('scans').update(scanId, {
      totalForks: usefulCount,
      processedForks: 0,
    }, PB_NO_CANCEL);

    // Store forks in parallel (all are new since we have a fresh scanId)
    await Promise.all(
      forks.map((fork) =>
        database.collection('forks').create({
          scanId,
          owner: fork.owner,
          repo: fork.repo,
          fullName: fork.fullName,
          stars: fork.stars,
          defaultBranch: fork.defaultBranch,
          updatedAt: fork.updatedAt,
          aheadBy: 0,
          filesChanged: 0,
          score: 0,
          stage: "discovery",
          untouched: fork.untouched,
        }, PB_NO_CANCEL)
      )
    );

    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "discovery",
      progress: 100,
      message: `Analyzing top ${usefulCount} forks (of ${totalRaw} total)`,
      processedCount: usefulCount,
      totalCount: usefulCount,
    });

    return { usefulCount, upstreamDefaultBranch };
  } catch (error) {
    await database.collection('scans').update(scanId, {
      status: "failed",
      error: errorMessage(error),
    }, PB_NO_CANCEL);
    throw error;
  }
}
