import PQueue from "p-queue";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { getOctokit, withRateLimit } from "./client";
import { TopFile, CommitMetadata } from "@/types";

const MAX_PATCH_SIZE = 50 * 1024;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  cs: "C#",
  cpp: "C++",
  c: "C",
  rb: "Ruby",
  php: "PHP",
  swift: "Swift",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  sql: "SQL",
};

interface FileChange {
  filename: string;
  additions: number;
  deletions: number;
}

type CompareData =
  RestEndpointMethodTypes["repos"]["compareCommitsWithBasehead"]["response"]["data"];

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { status?: number }).status === 404;
}

async function fetchCompareCommits(
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forkOwner: string,
  forkRepo: string,
  queue: PQueue,
  githubToken?: string,
  knownForkBranch?: string
): Promise<CompareData | null> {
  const octokit = getOctokit(githubToken);

  try {
    // defaultBranch already comes free from listForks during discovery —
    // only spend a repos.get call when the caller doesn't have it.
    const actualForkBranch =
      knownForkBranch ??
      (
        (await withRateLimit(
          () =>
            octokit.repos.get({
              owner: forkOwner,
              repo: forkRepo,
            }),
          queue,
          { cacheKey: `repo:${forkOwner}/${forkRepo}`, cacheTTL: 3600000 }
        )) as { data: { default_branch?: string } }
      ).data.default_branch;

    const cacheKey = `compare:${upstreamOwner}/${upstreamRepo}:${upstreamBranch}:${forkOwner}:${actualForkBranch}`;
    const response = await withRateLimit(
      () =>
        octokit.repos.compareCommits({
          owner: upstreamOwner,
          repo: upstreamRepo,
          base: upstreamBranch,
          head: `${forkOwner}:${actualForkBranch}`,
        }),
      queue,
      { cacheKey, cacheTTL: 7200000 }
    );

    return response.data;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function compareForkWithUpstream(
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forkOwner: string,
  forkRepo: string,
  queue: PQueue,
  githubToken?: string,
  knownForkBranch?: string
): Promise<{ aheadBy: number; files: FileChange[] } | null> {
  const data = await fetchCompareCommits(
    upstreamOwner,
    upstreamRepo,
    upstreamBranch,
    forkOwner,
    forkRepo,
    queue,
    githubToken,
    knownForkBranch
  );
  if (!data) return null;

  const files: FileChange[] = (data.files ?? []).map((file) => ({
    filename: file.filename,
    additions: file.additions,
    deletions: file.deletions,
  }));

  return { aheadBy: data.ahead_by ?? 0, files };
}

export async function getCommitsDiff(
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forkOwner: string,
  forkRepo: string,
  queue: PQueue,
  githubToken?: string,
  knownForkBranch?: string
): Promise<{ patch: string; commits: CommitMetadata[] } | null> {
  const data = await fetchCompareCommits(
    upstreamOwner,
    upstreamRepo,
    upstreamBranch,
    forkOwner,
    forkRepo,
    queue,
    githubToken,
    knownForkBranch
  );
  if (!data) return null;

  const commits: CommitMetadata[] = (data.commits ?? []).map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name ?? "Unknown",
    date: new Date(commit.commit.author?.date ?? Date.now()),
  }));

  const patchParts: string[] = [];
  let total = 0;
  let truncated = false;

  for (const file of data.files ?? []) {
    if (!file.patch) continue;
    if (total + file.patch.length > MAX_PATCH_SIZE) {
      truncated = true;
      break;
    }
    patchParts.push(file.patch + "\n");
    total += file.patch.length + 1;
  }

  const patch = truncated ? patchParts.join("") + "\n... (truncated)" : patchParts.join("");
  return { patch, commits };
}

interface GqlCompareResponse {
  data?: { repository?: { ref?: Record<string, { aheadBy?: number } | null> | null } | null };
  errors?: { type?: string; message?: string }[];
}

const GQL_BATCH_SIZE = 50;

// Batched ahead/behind check via GraphQL: ~50 forks per request at ~1 rate
// point, and GraphQL quota is a separate pool from REST core. This replaces
// per-fork `repos.get` + `compareCommits` REST calls for the aheadBy filter —
// the single biggest cost of a scan. aheadBy semantics verified identical to
// the REST compare endpoint (cross-repo `owner:branch` head refs supported).
// Returns null for forks whose head ref can't be resolved (deleted/renamed).
export async function batchAheadBy(
  upstreamOwner: string,
  upstreamRepo: string,
  upstreamBranch: string,
  forks: { owner: string; branch: string }[],
  queue: PQueue,
  githubToken?: string
): Promise<(number | null)[]> {
  const octokit = getOctokit(githubToken);
  const results: (number | null)[] = new Array(forks.length).fill(null);
  // headRef is inlined — keep out chars that would break the query string.
  const safe = (s: string) => /^[A-Za-z0-9._/-]+$/.test(s);

  for (let i = 0; i < forks.length; i += GQL_BATCH_SIZE) {
    const chunk = forks.slice(i, i + GQL_BATCH_SIZE);
    const compares = chunk
      .map((f, j) =>
        safe(f.owner) && safe(f.branch)
          ? `f${j}: compare(headRef: "${f.owner}:${f.branch}") { aheadBy }`
          : `f${j}: compare(headRef: "x:x") { aheadBy }`
      )
      .join("\n");

    const gql = await withRateLimit(async () => {
      const resp = await octokit.request("POST /graphql", {
        data: {
          query: `query { repository(owner: "${upstreamOwner}", name: "${upstreamRepo}") { ref(qualifiedName: "${upstreamBranch}") {\n${compares}\n} } }`,
        },
      });
      const g = resp.data as GqlCompareResponse;
      // Per-alias NOT_FOUNDs are tolerated (null aheadBy). Anything else —
      // RATE_LIMITED, FORBIDDEN, INTERNAL — fails the batch. RATE_LIMITED gets
      // retry-after markers so withRateLimit backs off; the rest retry as
      // generic failures.
      const fatal = (g.errors ?? []).find((e) => e.type && e.type !== "NOT_FOUND");
      if (fatal) {
        throw Object.assign(new Error(`GraphQL ${fatal.type}: ${fatal.message}`), {
          status: fatal.type === "RATE_LIMITED" ? 403 : undefined,
          response:
            fatal.type === "RATE_LIMITED" ? { headers: { "retry-after": "30" } } : undefined,
        });
      }
      return g;
    }, queue);

    const repo = gql.data?.repository;
    if (!repo) throw new Error(`GraphQL: upstream repository ${upstreamOwner}/${upstreamRepo} not found`);
    if (!repo.ref) throw new Error(`GraphQL: upstream branch "${upstreamBranch}" not found`);

    chunk.forEach((_, j) => {
      results[i + j] = repo.ref?.[`f${j}`]?.aheadBy ?? null;
    });
  }
  return results;
}

export function analyzeFileChanges(files: FileChange[]): TopFile[] {
  return [...files]
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 20)
    .map((file) => ({
      filename: file.filename,
      additions: file.additions,
      deletions: file.deletions,
      language: getLanguageFromFilename(file.filename),
    }));
}

function getLanguageFromFilename(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext ? LANGUAGE_BY_EXTENSION[ext] : undefined;
}
