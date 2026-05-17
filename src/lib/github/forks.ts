import PQueue from "p-queue";
import { getOctokit, withRateLimit } from "./client";
import { ForkMetadata } from "@/types";

const FORKS_PER_PAGE = 100;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const DEFAULT_MAX_FORKS = 1000;

export interface ForkDiscoveryProgress {
  checked: number;
  total: number;
  useful: number;
}

function normalizeKeywords(keywords?: string[]): string[] {
  if (!keywords?.length) return [];
  return [...new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean))];
}

/** Short repos listing payload — enough for keyword filtering on discovery. */
function ghForkMatchesKeywords(
  fork: { full_name?: string | null; description?: string | null },
  lowered: string[]
): boolean {
  if (lowered.length === 0) return true;
  const hay = `${fork.full_name ?? ""} ${fork.description ?? ""}`.toLowerCase();
  return lowered.some((kw) => hay.includes(kw));
}

export async function fetchAllForks(
  owner: string,
  repo: string,
  queue: PQueue,
  maxForks: number = DEFAULT_MAX_FORKS,
  onProgress?: (progress: ForkDiscoveryProgress) => void | Promise<void>,
  githubToken?: string,
  keywords?: string[]
): Promise<{ forks: ForkMetadata[]; totalRaw: number; upstreamDefaultBranch: string }> {
  const octokit = getOctokit(githubToken);

  // Single call to get repo metadata and first page of forks simultaneously
  const [parentRepo, firstPage] = await Promise.all([
    withRateLimit(() => octokit.repos.get({ owner, repo }), queue, { cacheKey: `repo:${owner}/${repo}`, cacheTTL: 3600000 }),
    withRateLimit(() => octokit.repos.listForks({ owner, repo, per_page: FORKS_PER_PAGE, page: 1, sort: "stargazers" }), queue, { cacheKey: `forks:${owner}/${repo}:1`, cacheTTL: 1800000 }),
  ]);

  const totalRaw = parentRepo.data.forks_count ?? 0;
  const totalPages = Math.ceil(totalRaw / FORKS_PER_PAGE);

  await onProgress?.({ checked: firstPage.data.length, total: totalRaw, useful: 0 });

  // Fetch all remaining pages in parallel
  const remainingPageResults = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) =>
          withRateLimit(() =>
            octokit.repos.listForks({ owner, repo, per_page: FORKS_PER_PAGE, page: i + 2, sort: "stargazers" }),
            queue,
            { cacheKey: `forks:${owner}/${repo}:${i + 2}`, cacheTTL: 1800000 }
          )
        )
      )
    : [];

  const allForkData = [firstPage, ...remainingPageResults].flatMap((p) => p.data ?? []);

  await onProgress?.({ checked: allForkData.length, total: totalRaw, useful: 0 });

  // Rank by recency + stars heuristic (no per-fork API calls needed).
  // Recency dominates: recently-pushed forks are far more likely to have
  // unique commits than popular mirrors. Stars break recency ties.
  const now = Date.now();
  const scored = allForkData.map((fork) => {
    const pushedMs = fork.pushed_at ? new Date(fork.pushed_at).getTime() : 0;
    const recencyScore = Math.max(0, 1 - (now - pushedMs) / ONE_YEAR_MS);
    const score = recencyScore * 1000 + (fork.stargazers_count ?? 0) * 10;
    return { fork, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const kw = normalizeKeywords(keywords);
  let selected =
    kw.length === 0
      ? scored.slice(0, maxForks)
      : scored.filter(({ fork }) => ghForkMatchesKeywords(fork, kw)).slice(0, maxForks);

  if (kw.length > 0 && selected.length === 0) {
    // Keywords excluded everything — fall back so scans stay actionable.
    selected = scored.slice(0, maxForks);
  }
  const forks: ForkMetadata[] = selected.map(({ fork }) => {
    // GitHub quirk: when a fork has never received a push, its `pushed_at`
    // is inherited from the parent repo — which is *before* the fork's
    // own `created_at`. So `pushed_at < created_at` is a zero-false-positive
    // signal that aheadBy must be 0 (the fork is just a snapshot of the
    // upstream at fork time). Any pushed_at >= created_at could be a real
    // commit on the fork and needs the compare call to know for sure.
    const createdMs = fork.created_at ? new Date(fork.created_at).getTime() : 0;
    const pushedMsForUntouched = fork.pushed_at
      ? new Date(fork.pushed_at).getTime()
      : 0;
    const untouched =
      createdMs > 0 &&
      pushedMsForUntouched > 0 &&
      pushedMsForUntouched < createdMs;

    return {
      owner: fork.owner!.login,
      repo: fork.name,
      fullName: fork.full_name,
      stars: fork.stargazers_count ?? 0,
      defaultBranch: fork.default_branch ?? "main",
      updatedAt: new Date(fork.updated_at ?? Date.now()),
      untouched,
    };
  });

  await onProgress?.({ checked: allForkData.length, total: totalRaw, useful: forks.length });

  return { forks, totalRaw, upstreamDefaultBranch: parentRepo.data.default_branch };
}

export async function getRepoInfo(owner: string, repo: string, queue: PQueue, githubToken?: string) {
  const octokit = getOctokit(githubToken);
  return withRateLimit(async () => {
    const response = await octokit.repos.get({ owner, repo });
    return {
      defaultBranch: response.data.default_branch,
      stars: response.data.stargazers_count,
      updatedAt: new Date(response.data.updated_at),
    };
  }, queue, { cacheKey: `repo:${owner}/${repo}`, cacheTTL: 3600000 });
}
