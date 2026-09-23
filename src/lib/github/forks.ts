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
  fork: { nameWithOwner?: string | null; description?: string | null },
  lowered: string[]
): boolean {
  if (lowered.length === 0) return true;
  const hay = `${fork.nameWithOwner ?? ""} ${fork.description ?? ""}`.toLowerCase();
  return lowered.some((kw) => hay.includes(kw));
}

interface GqlForkNode {
  nameWithOwner?: string;
  description?: string;
  pushedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  stargazerCount?: number;
  isPrivate?: boolean;
  defaultBranchRef?: { name?: string } | null;
}

interface GqlForksResponse {
  data?: {
    repository?: {
      defaultBranchRef?: { name?: string } | null;
      forks?: {
        totalCount?: number;
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        nodes?: (GqlForkNode | null)[];
      };
    } | null;
  };
  errors?: { type?: string; message?: string }[];
}

// Forks older than this can't out-rank anything recent under a pushed_at
// ordering — pages are fetched newest-first so the tail can be cut off.
const STALE_FORK_MS = 2 * ONE_YEAR_MS;

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

  // GraphQL forks connection ordered by PUSHED_AT DESC: pages arrive
  // most-recently-pushed first, so we stop once maxForks candidates are
  // collected or the page tail goes stale — instead of fetching EVERY page
  // (a 5k-fork repo was 51 REST calls; this is ~1-2 GraphQL points/page).
  // defaultBranchRef on the upstream is free in the same query.
  const query = `query($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef { name }
      forks(first: ${FORKS_PER_PAGE}, after: $cursor, orderBy: {field: PUSHED_AT, direction: DESC}) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          nameWithOwner description pushedAt createdAt updatedAt
          stargazerCount isPrivate
          defaultBranchRef { name }
        }
      }
    }
  }`;

  const collected: { fork: GqlForkNode; score: number }[] = [];
  // GitHub's forks connection can return the same nameWithOwner twice
  // (renamed repos / network entries). Dedupe or every later stage and the
  // results UI sees duplicate rows.
  const seen = new Set<string>();
  let cursor: string | null = null;
  let totalRaw = 0;
  let upstreamDefaultBranch = "main";
  let stale = false;
  const now = Date.now();

  do {
    const g = await withRateLimit(async () => {
      const resp = await octokit.request("POST /graphql", {
        data: { query, variables: { owner, name: repo, cursor } },
      });
      const d = resp.data as GqlForksResponse;
      const fatal = (d.errors ?? []).find((e) => e.type && e.type !== "NOT_FOUND");
      if (fatal) {
        throw Object.assign(new Error(`GraphQL ${fatal.type}: ${fatal.message}`), {
          status: fatal.type === "RATE_LIMITED" ? 403 : undefined,
          response:
            fatal.type === "RATE_LIMITED" ? { headers: { "retry-after": "30" } } : undefined,
        });
      }
      return d;
    }, queue);

    const repository = g.data?.repository;
    if (!repository) throw new Error(`Repository ${owner}/${repo} not found`);
    upstreamDefaultBranch = repository.defaultBranchRef?.name ?? upstreamDefaultBranch;

    const conn = repository.forks;
    if (!conn) throw new Error(`No forks data for ${owner}/${repo}`);
    totalRaw = conn.totalCount ?? totalRaw;

    const nodes = (conn.nodes ?? []).filter(
      (n): n is GqlForkNode =>
        !!n && !n.isPrivate && !!n.nameWithOwner && !seen.has(n.nameWithOwner) && !!seen.add(n.nameWithOwner)
    );
    for (const fork of nodes) {
      const pushedMs = fork.pushedAt ? new Date(fork.pushedAt).getTime() : 0;
      const recencyScore = Math.max(0, 1 - (now - pushedMs) / ONE_YEAR_MS);
      collected.push({ fork, score: recencyScore * 1000 + (fork.stargazerCount ?? 0) * 10 });
    }

    const tailPushedMs = nodes.length
      ? new Date(nodes[nodes.length - 1].pushedAt ?? 0).getTime()
      : 0;
    stale = nodes.length === 0 || now - tailPushedMs > STALE_FORK_MS;
    cursor = conn.pageInfo?.endCursor ?? null;
    const hasNext = conn.pageInfo?.hasNextPage ?? false;

    await onProgress?.({ checked: collected.length, total: totalRaw, useful: 0 });

    if (!hasNext || collected.length >= maxForks || stale) break;
  } while (true);

  // Score-sort within the collected window (recency dominates; stars break
  // ties), then cap — same selection formula as before, bounded input.
  collected.sort((a, b) => b.score - a.score);

  const kw = normalizeKeywords(keywords);
  let selected =
    kw.length === 0
      ? collected.slice(0, maxForks)
      : collected.filter(({ fork }) => ghForkMatchesKeywords(fork, kw)).slice(0, maxForks);

  if (kw.length > 0 && selected.length === 0) {
    // Keywords excluded everything — fall back so scans stay actionable.
    selected = collected.slice(0, maxForks);
  }
  const forks: ForkMetadata[] = selected.map(({ fork }) => {
    // GitHub quirk: when a fork has never received a push, its `pushed_at`
    // is inherited from the parent repo — which is *before* the fork's
    // own `created_at`. So `pushed_at < created_at` is a zero-false-positive
    // signal that aheadBy must be 0 (the fork is just a snapshot of the
    // upstream at fork time). Any pushed_at >= created_at could be a real
    // commit on the fork and needs the compare call to know for sure.
    const createdMs = fork.createdAt ? new Date(fork.createdAt).getTime() : 0;
    const pushedMsForUntouched = fork.pushedAt ? new Date(fork.pushedAt).getTime() : 0;
    const untouched =
      createdMs > 0 &&
      pushedMsForUntouched > 0 &&
      pushedMsForUntouched < createdMs;

    const [forkOwner, forkRepo] = (fork.nameWithOwner ?? "/").split("/");
    return {
      owner: forkOwner,
      repo: forkRepo,
      fullName: fork.nameWithOwner ?? `${forkOwner}/${forkRepo}`,
      stars: fork.stargazerCount ?? 0,
      defaultBranch: fork.defaultBranchRef?.name ?? "main",
      updatedAt: new Date(fork.updatedAt ?? Date.now()),
      untouched,
    };
  });

  await onProgress?.({ checked: collected.length, total: totalRaw, useful: forks.length });

  return { forks, totalRaw, upstreamDefaultBranch };
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
