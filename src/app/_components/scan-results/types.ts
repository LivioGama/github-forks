export interface Fork {
  id: string;
  owner: string;
  repo: string;
  stars: number;
  aheadBy: number;
  filesChanged: number;
  score: number;
  summary: string;
  deepSummary?: string | null;
  deepSummaryGeneratedAt?: string | null;
}

export interface ScanResponse {
  scan: {
    owner: string;
    repo: string;
    status: string;
    totalForks?: number;
    error?: string;
  };
  topForks: Fork[];
}

export interface AskResult {
  matches: boolean;
  reasoning: string;
  skipped?: boolean;
}

export type AskPhase = "idle" | "running" | "done" | "error";
