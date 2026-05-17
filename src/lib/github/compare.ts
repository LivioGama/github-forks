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
  githubToken?: string
): Promise<CompareData | null> {
  const octokit = getOctokit(githubToken);

  try {
    const forkInfo = await withRateLimit(
      () =>
        octokit.repos.get({
          owner: forkOwner,
          repo: forkRepo,
        }),
      queue,
      { cacheKey: `repo:${forkOwner}/${forkRepo}`, cacheTTL: 3600000 }
    );
    const actualForkBranch = forkInfo.data.default_branch;

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
  githubToken?: string
): Promise<{ aheadBy: number; files: FileChange[] } | null> {
  const data = await fetchCompareCommits(
    upstreamOwner,
    upstreamRepo,
    upstreamBranch,
    forkOwner,
    forkRepo,
    queue,
    githubToken
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
  githubToken?: string
): Promise<{ patch: string; commits: CommitMetadata[] } | null> {
  const data = await fetchCompareCommits(
    upstreamOwner,
    upstreamRepo,
    upstreamBranch,
    forkOwner,
    forkRepo,
    queue,
    githubToken
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
