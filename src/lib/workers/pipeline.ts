import { getDb } from "@/lib/db";
import { forkDiscoveryWorker } from "./forkDiscovery";
import { diffExtractionWorker } from "./diffExtraction";
import { rankingWorker } from "@/lib/ranking/engine";
import { clearJob } from "@/lib/queue/jobQueue";
import { errorMessage } from "@/lib/errors";

export interface ScanConfig {
  owner: string;
  repo: string;
  upstreamBranch?: string;
  keywords?: string[];
  maxForks?: number;
  githubToken?: string;
}

export async function runScanPipeline(scanId: string, config: ScanConfig): Promise<void> {
  const database = await getDb();

  try {
    await database.collection('scans').update(scanId, {
      status: "running",
    });

    const { upstreamDefaultBranch } = await forkDiscoveryWorker(
      scanId,
      config.owner,
      config.repo,
      config.maxForks,
      config.githubToken,
      config.keywords
    );
    const upstreamBranch = config.upstreamBranch || upstreamDefaultBranch;
    await diffExtractionWorker(scanId, config.owner, config.repo, upstreamBranch, config.githubToken);
    await rankingWorker(scanId);

    await database.collection('scans').update(scanId, {
      status: "completed",
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    await database.collection('scans').update(scanId, {
      status: "failed",
      error: errorMessage(error),
      finishedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    clearJob(scanId);
  }
}
