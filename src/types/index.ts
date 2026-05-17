export interface ForkMetadata {
  owner: string;
  repo: string;
  fullName: string;
  stars: number;
  defaultBranch: string;
  updatedAt: Date;
  // True when pushed_at is at-or-near created_at — nobody ever pushed
  // a commit to this fork, so it's guaranteed to have aheadBy === 0
  // vs any upstream branch. diffExtraction uses this to skip the
  // GitHub compare API call entirely.
  untouched: boolean;
}

export interface DiffSummary {
  aheadBy: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  topFiles: TopFile[];
  commits: CommitMetadata[];
}

export interface TopFile {
  filename: string;
  additions: number;
  deletions: number;
  language?: string;
}

export interface CommitMetadata {
  sha: string;
  message: string;
  author: string;
  date: Date;
}

export interface ForkAnalysis {
  forkId: string;
  owner: string;
  repo: string;
  stars: number;
  aheadBy: number;
  filesChanged: number;
  linesChanged: number;
  score: number;
  summary: string;
  topFiles: TopFile[];
  topCommits: CommitMetadata[];
}

export interface ScanJob {
  id: string;
  owner: string;
  repo: string;
  status: "pending" | "running" | "completed" | "failed";
  totalForks?: number;
  processedForks: number;
  keywords?: string[];
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
}

export interface ScanProgress {
  jobId: string;
  stage: "discovery" | "diff" | "features" | "semantic" | "ranking";
  progress: number;
  message: string;
  processedCount: number;
  totalCount: number;
}

export interface RankedFork {
  forkId: string;
  owner: string;
  repo: string;
  score: number;
  aheadBy: number;
  filesChanged: number;
  stars: number;
  updatedAt: Date;
  summary: string;
  semanticRelevance?: number;
}
