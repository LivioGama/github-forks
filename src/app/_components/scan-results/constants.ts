export const POLL_INTERVAL_MS = 2000;

export const fetcher = (url: string) => fetch(url).then((response) => response.json());

export const isTerminal = (status: string | undefined) =>
  status === "completed" || status === "failed";

export const forkKey = (owner: string, repo: string) => `${owner}/${repo}`;
