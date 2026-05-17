import { Octokit } from "@octokit/rest";
import PQueue from "p-queue";
import { get, set as setCache } from "@/lib/cache/githubCache";

interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
}

interface HttpError {
  status?: number;
  response?: { headers?: Record<string, string> };
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

// High concurrency, no interval cap — rely on retry for rate limits
export const QUEUE_OPTIONS = {
  concurrency: 20,
} as const;

const REQUEST_TIMEOUT_MS = 30_000;

class TimeoutError extends Error {
  readonly isTimeout = true;
  constructor() { super(`GitHub request timed out after ${REQUEST_TIMEOUT_MS}ms`); }
}

let defaultOctokit: Octokit | null = null;

export function getOctokit(userToken?: string): Octokit {
  // If a user-provided token is given, create a fresh Octokit instance for it.
  // User tokens are never cached long-term and live only for the duration of a scan.
  if (userToken) {
    const baseUrl = process.env.GITHUB_BASE_URL || "https://api.github.com";
    return new Octokit({ auth: userToken, baseUrl });
  }

  // Singleton for the embedded / env token
  if (defaultOctokit) return defaultOctokit;

  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");

  const baseUrl = process.env.GITHUB_BASE_URL || "https://api.github.com";

  defaultOctokit = new Octokit({ auth: token, baseUrl });
  return defaultOctokit;
}

export function createQueue(): PQueue {
  return new PQueue(QUEUE_OPTIONS);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRateLimit<T>(
  fn: () => Promise<T>,
  queue: PQueue,
  options: Partial<RetryOptions> & { cacheKey?: string; cacheTTL?: number } = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  const { cacheKey, cacheTTL = 3600000 } = options;

  // Check cache if cache key is provided
  if (cacheKey) {
    const cached = await get<T>(cacheKey, {});
    if (cached !== null) {
      return cached;
    }
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      // Timer starts inside queue.add so it only measures actual HTTP time, not queue wait.
      const result = await (queue.add(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new TimeoutError()), REQUEST_TIMEOUT_MS);
        try {
          return await Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
              controller.signal.addEventListener("abort", () => reject(controller.signal.reason));
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }) as Promise<T>);

      // Cache the result if cache key is provided
      if (cacheKey) {
        await setCache(cacheKey, result, {}, cacheTTL);
      }

      return result;
    } catch (error) {
      lastError = error;

      if (error instanceof TimeoutError) throw error;

      const { status, response } = error as HttpError;
      if (status !== undefined && status >= 400 && status !== 429) throw error;

      if (attempt < opts.maxRetries) {
        const retryAfter = response?.headers?.["retry-after"];
        const delay = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : opts.delayMs * Math.pow(opts.backoffMultiplier, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed after max retries");
}
