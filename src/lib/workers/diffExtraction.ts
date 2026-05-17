import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { compareForkWithUpstream, getCommitsDiff, analyzeFileChanges } from "@/lib/github/compare";
import { createQueue } from "@/lib/github/client";
import { updateJobProgress } from "@/lib/queue/jobQueue";
import { errorMessage } from "@/lib/errors";
import type { RecordModel } from "pocketbase";

type ForkRow = RecordModel & {
  owner: string;
  repo: string;
  stage: string;
};

// Belt-and-suspenders for the PB patch field constraint.
// Relationship: compare.ts MAX_PATCH_SIZE (51200) ≤ STORAGE_PATCH_MAX (55000) ≤
// pocketbase-schema.ts diffs.patch max (60000)
const STORAGE_PATCH_MAX = 55000;

export async function diffExtractionWorker(
  scanId: string,
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  githubToken?: string
): Promise<void> {
  const database = await getDb();
  const queue = createQueue();
  try {
    const forks = await database.collection('forks').getFullList({
      ...PB_NO_CANCEL,
      filter: `scanId = "${scanId}" && stage != "completed"`,
    });

    const totalForks = forks.length;
    let processedCount = 0;

    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "diff",
      progress: 0,
      message: `Comparing ${totalForks} forks with upstream...`,
      processedCount: 0,
      totalCount: totalForks,
    });

    const flushProgress = () =>
      database.collection('scans').update(scanId, { processedForks: processedCount }, PB_NO_CANCEL);

    // All forks run in parallel — concurrency bounded by the shared queue
    await Promise.all(
      forks.map(async (fork) => {
        const row = fork as ForkRow;
        if (["diff_extraction", "semantic_indexing", "ranking", "completed"].includes(row.stage)) {
          processedCount++;
          updateJobProgress(scanId, {
            jobId: scanId,
            stage: "diff",
            progress: Math.round((processedCount / totalForks) * 100),
            message: `Skipped ${processedCount}/${totalForks} (already processed)`,
            processedCount,
            totalCount: totalForks,
          });
          return;
        }

        try {
          const comparison = await compareForkWithUpstream(
            upstreamOwner,
            upstreamRepo,
            upstreamBranch,
            row.owner,
            row.repo,
            queue,
            githubToken
          );

          if (!comparison || comparison.aheadBy === 0) {
            // Fork is not ahead — record as no-op, skip expensive getCommitsDiff.
            // status must be one of the diffs schema enum (extracted|failed|
            // not_found); "no_changes" is not a valid value and would be
            // rejected by PocketBase, masking the record as a spurious failure.
            await database.collection('diffs').create({
              forkId: row.id,
              status: "not_found",
            }, PB_NO_CANCEL);
          } else {
            const diffData = await getCommitsDiff(
              upstreamOwner,
              upstreamRepo,
              upstreamBranch,
              row.owner,
              row.repo,
              queue,
              githubToken
            );

            const topFiles = analyzeFileChanges(comparison.files);
            const linesAdded = comparison.files.reduce((sum, f) => sum + f.additions, 0);
            const linesRemoved = comparison.files.reduce((sum, f) => sum + f.deletions, 0);

            // Truncate patch to STORAGE_PATCH_MAX to prevent PB field constraint errors
            const patch = diffData?.patch ? diffData.patch.substring(0, STORAGE_PATCH_MAX) : "";

            await Promise.all([
              database.collection('diffs').create({
                forkId: row.id,
                patch,
                topFiles: topFiles,
                commitsCount: diffData?.commits.length ?? 0,
                status: "extracted",
              }, PB_NO_CANCEL),
              database.collection('forks').update(row.id, {
                aheadBy: comparison.aheadBy,
                filesChanged: comparison.files.length,
                linesAdded,
                linesRemoved,
                topFiles: topFiles,
                commitsJson: diffData?.commits ?? [],
                stage: "diff_extraction",
              }, PB_NO_CANCEL),
            ]);
          }
        } catch (error) {
          await database.collection('diffs').create({
            forkId: row.id,
            status: "failed",
            error: errorMessage(error),
          }, PB_NO_CANCEL);
        } finally {
          processedCount++;
          updateJobProgress(scanId, {
            jobId: scanId,
            stage: "diff",
            progress: Math.round((processedCount / totalForks) * 100),
            message: `Processed ${processedCount}/${totalForks} forks`,
            processedCount,
            totalCount: totalForks,
          });
          if (processedCount % 5 === 0 || processedCount === totalForks) {
            await flushProgress();
          }
        }
      })
    );

    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "diff",
      progress: 100,
      message: "Diff extraction complete",
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
