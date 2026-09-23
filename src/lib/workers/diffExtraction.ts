import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { compareForkWithUpstream, getCommitsDiff, analyzeFileChanges, batchAheadBy } from "@/lib/github/compare";
import { createQueue, errorIsRateLimited } from "@/lib/github/client";
import { updateJobProgress } from "@/lib/queue/jobQueue";
import { errorMessage } from "@/lib/errors";
import type { RecordModel } from "pocketbase";

type ForkRow = RecordModel & {
  owner: string;
  repo: string;
  stage: string;
  untouched?: boolean;
  defaultBranch?: string;
};

const DONE_STAGES = ["diff_extraction", "semantic_indexing", "ranking", "completed"];
const AHEAD_BATCH = 50;

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
    // Set when a fatal error (bad token, exhausted rate limit) aborts the scan.
    // Sibling fork tasks see it and skip writing per-fork failure rows.
    let fatal: unknown = null;

    updateJobProgress(scanId, {
      jobId: scanId,
      stage: "diff",
      progress: 0,
      message: `Comparing ${totalForks} forks with upstream...`,
      processedCount: 0,
      totalCount: totalForks,
    });

    const flushProgress = () =>
      queue.add(() =>
        database.collection('scans').update(scanId, { processedForks: processedCount }, PB_NO_CANCEL)
      );

    const rows = forks as ForkRow[];
    // untouched (pushed_at < created_at) and already-processed rows are
    // instant skips — no API calls at all.
    const candidates = rows.filter((r) => !DONE_STAGES.includes(r.stage) && !r.untouched);
    processedCount = totalForks - candidates.length;

    // aheadBy check is batched through GraphQL: ~50 forks per request at ~1
    // rate point from a quota pool SEPARATE from REST. Only forks that are
    // actually ahead (~5-10% typically) then cost a REST compare call for
    // files/patch/commits.
    for (let i = 0; i < candidates.length; i += AHEAD_BATCH) {
      const batch = candidates.slice(i, i + AHEAD_BATCH);
      const aheadList = await batchAheadBy(
        upstreamOwner,
        upstreamRepo,
        upstreamBranch,
        batch.map((r) => ({ owner: r.owner, branch: r.defaultBranch ?? "main" })),
        queue,
        githubToken
      );

      await Promise.all(
        batch.map(async (row, j) => {
          try {
            if (fatal) return;
            const aheadBy = aheadList[j];
            // null = head unresolvable (fork deleted/renamed); 0 = not ahead.
            // Either way: no DB write, aheadBy stays 0, filtered from results.
            if (aheadBy === null || aheadBy === 0) return;

            // Ahead: one REST compare for files, then getCommitsDiff hits the
            // same cached response for patch+commits.
            const comparison = await compareForkWithUpstream(
              upstreamOwner,
              upstreamRepo,
              upstreamBranch,
              row.owner,
              row.repo,
              queue,
              githubToken,
              row.defaultBranch
            );
            if (!comparison || comparison.aheadBy === 0) return;

            const diffData = await getCommitsDiff(
              upstreamOwner,
              upstreamRepo,
              upstreamBranch,
              row.owner,
              row.repo,
              queue,
              githubToken,
              row.defaultBranch
            );

            const topFiles = analyzeFileChanges(comparison.files);
            const linesAdded = comparison.files.reduce((sum, f) => sum + f.additions, 0);
            const linesRemoved = comparison.files.reduce((sum, f) => sum + f.deletions, 0);

            // Truncate patch to STORAGE_PATCH_MAX to prevent PB field constraint errors
            const patch = diffData?.patch ? diffData.patch.substring(0, STORAGE_PATCH_MAX) : "";

            await queue.addAll([
              () => database.collection('diffs').create({
                forkId: row.id,
                patch,
                topFiles: topFiles,
                commitsCount: diffData?.commits.length ?? 0,
                status: "extracted",
              }, PB_NO_CANCEL),
              () => database.collection('forks').update(row.id, {
                aheadBy: comparison.aheadBy,
                filesChanged: comparison.files.length,
                linesAdded,
                linesRemoved,
                topFiles: topFiles,
                commitsJson: diffData?.commits ?? [],
                stage: "diff_extraction",
              }, PB_NO_CANCEL),
            ]);
          } catch (error) {
            if (fatal) return;
            const status = (error as { status?: number }).status;
            // 401 = the token is bad for EVERY fork; a rate limit that survived
            // retries is global too. Fail the whole scan with one clear error
            // instead of writing a failed diffs row per fork.
            if (status === 401 || errorIsRateLimited(error)) {
              fatal = error;
              throw error;
            }
            await queue.add(() =>
              database.collection('diffs').create({
                forkId: row.id,
                status: "failed",
                error: errorMessage(error),
              }, PB_NO_CANCEL)
            );
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
    }

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
