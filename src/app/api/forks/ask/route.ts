import { NextRequest, NextResponse } from "next/server";
import type { RecordModel } from "pocketbase";
import PQueue from "p-queue";
import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { classifyFork, ClassifierFork } from "@/lib/ask/classifier";
import { errorMessage } from "@/lib/errors";

// SSE endpoint: GET /api/forks/ask?scanId=X&q=Y
//
// Loops over every "meaningful" fork in the scan (those with a real diff)
// and asks the LLM the same question of each. Streams results as they
// arrive so the UI can update incrementally.
//
// Uses GET (not POST) so the frontend can use EventSource. The question is
// short and idempotent so query-string is fine.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ASK safety limits
const QUESTION_MAX_LENGTH = 500;
const ASK_RATE_LIMIT = 10; // requests per minute per IP
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Bounded LLM concurrency: enough to feel fast on ~50 forks, not so many
// that we hammer OpenAI or starve the GitHub queue.
const CLASSIFY_CONCURRENCY = 5;

// Patch is sliced again inside the classifier; this is the upper bound we
// pass over the wire from PocketBase.
const PATCH_FETCH_MAX = 8000;

/** Bound memory: SSE replay cache + IP buckets are server-local only. */
const RESULT_CACHE_MAX_ENTRIES = 512;
const RATE_LIMIT_MAP_MAX_ENTRIES = 5000;
const RATE_LIMIT_STALE_MS = 120_000;

interface AskStartPayload {
  total: number;
  question: string;
}

interface AskResultPayload {
  owner: string;
  repo: string;
  fullName?: string;
  score?: number;
  matches: boolean;
  reasoning: string;
  skipped: boolean;
  completed: number;
  total: number;
}

interface AskDonePayload {
  matched: number;
  total: number;
}

interface CachedAskBundle {
  start: AskStartPayload;
  results: AskResultPayload[];
  done: AskDonePayload;
}

const resultCache = new Map<string, { data: CachedAskBundle; expiresAt: number }>();

const ipRateLimiter = new Map<string, { tokens: number; lastReset: number }>();

function pruneExpiredAskCache(): void {
  const now = Date.now();
  for (const [key, entry] of resultCache) {
    if (now > entry.expiresAt) resultCache.delete(key);
  }
}

function trimAskResultCache(): void {
  pruneExpiredAskCache();
  while (resultCache.size > RESULT_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
  }
}

function pruneStaleRateLimitEntries(now: number): void {
  for (const [ip, entry] of ipRateLimiter) {
    if (now - entry.lastReset > RATE_LIMIT_STALE_MS) ipRateLimiter.delete(ip);
  }
  while (ipRateLimiter.size > RATE_LIMIT_MAP_MAX_ENTRIES) {
    const first = ipRateLimiter.keys().next().value as string | undefined;
    if (first === undefined) break;
    ipRateLimiter.delete(first);
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  pruneStaleRateLimitEntries(now);
  const entry = ipRateLimiter.get(ip);

  if (!entry || now - entry.lastReset > 60000) {
    ipRateLimiter.set(ip, { tokens: ASK_RATE_LIMIT - 1, lastReset: now });
    return true;
  }

  if (entry.tokens > 0) {
    entry.tokens -= 1;
    return true;
  }

  return false;
}

function getCachedResult(cacheKey: string): CachedAskBundle | null {
  pruneExpiredAskCache();
  const entry = resultCache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    resultCache.delete(cacheKey);
    return null;
  }

  return entry.data;
}

function setCachedResult(cacheKey: string, data: CachedAskBundle): void {
  resultCache.set(cacheKey, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  trimAskResultCache();
}

type ForkAskRow = RecordModel & {
  owner: string;
  repo: string;
  fullName?: string;
  score?: number;
  commitsJson?: unknown;
};

type CommitJson = { sha?: string; message?: string };

function parseJsonArray<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw !== "string") return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const scanId = params.get("scanId");
  const question = params.get("q");

  // Get client IP for rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // Check rate limit
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded: max 10 asks per minute" },
      { status: 429 }
    );
  }

  if (!scanId) {
    return NextResponse.json({ error: "scanId is required" }, { status: 400 });
  }
  if (!question || question.trim().length === 0) {
    return NextResponse.json({ error: "q (question) is required" }, { status: 400 });
  }

  const trimmedQuestion = question.trim();

  // Enforce question length cap
  if (trimmedQuestion.length > QUESTION_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Question too long: max ${QUESTION_MAX_LENGTH} characters` },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  // Check cache
  const cacheKey = `${scanId}:${trimmedQuestion}`;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    // Return cached result as SSE
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: object) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        send("start", cached.start);
        cached.results.forEach((r) => send("result", r));
        send("done", cached.done);
        controller.close();
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let aborted = false;
      request.signal.addEventListener("abort", () => {
        aborted = true;
      });

      // Collect results for caching
      const results: AskResultPayload[] = [];
      let startData: AskStartPayload | null = null;

      try {
        const database = await getDb();

        // Pull every fork that's actually ahead of upstream. Forks at parity
        // have no diff to analyse, so there's nothing to ask about.
        const forks = await database.collection("forks").getFullList({
          ...PB_NO_CANCEL,
          filter: `scanId = "${scanId}" && aheadBy > 0`,
          sort: "-score",
        });

        startData = { total: forks.length, question: trimmedQuestion };
        send("start", startData);

        if (forks.length === 0) {
          const doneData = { matched: 0, total: 0 };
          send("done", doneData);
          controller.close();
          // Cache empty result
          setCachedResult(cacheKey, { start: startData, results: [], done: doneData });
          return;
        }

        const queue = new PQueue({ concurrency: CLASSIFY_CONCURRENCY });
        let matched = 0;
        let completed = 0;

        await Promise.all(
          forks.map((forkRecord) =>
            queue.add(async () => {
              if (aborted) return;

              const fork = forkRecord as ForkAskRow;

              try {
                // Fetch the diff record for this fork — patch + topFiles.
                const diffList = await database.collection("diffs").getList(1, 1, {
                  ...PB_NO_CANCEL,
                  filter: `forkId = "${fork.id}"`,
                });
                const diff = diffList.items[0] as { status?: string; patch?: string; topFiles?: unknown } | undefined;

                // Only "extracted" diffs have a patch worth classifying.
                if (!diff || diff.status !== "extracted") {
                  completed += 1;
                  const result = {
                    owner: fork.owner,
                    repo: fork.repo,
                    fullName: fork.fullName,
                    score: fork.score,
                    matches: false,
                    reasoning: "Skipped — no extracted diff available.",
                    skipped: true,
                    completed,
                    total: forks.length,
                  };
                  results.push(result);
                  send("result", result);
                  return;
                }

                const topFiles = parseJsonArray<{ filename?: string }>(diff.topFiles);
                const commits = parseJsonArray<CommitJson>(fork.commitsJson);

                const classifierInput: ClassifierFork = {
                  owner: fork.owner,
                  repo: fork.repo,
                  summary: fork.summary ?? "",
                  aheadBy: fork.aheadBy ?? 0,
                  filesChanged: fork.filesChanged ?? 0,
                  topFileNames: topFiles
                    .map((f) => (typeof f?.filename === "string" ? f.filename : ""))
                    .filter(Boolean),
                  commitMessages: commits
                    .map((c) => (typeof c?.message === "string" ? c.message : ""))
                    .filter(Boolean),
                  patch: typeof diff.patch === "string" ? diff.patch.slice(0, PATCH_FETCH_MAX) : "",
                };

                const result = await classifyFork(trimmedQuestion, classifierInput);

                completed += 1;
                if (result.matches) matched += 1;

                const resultData = {
                  owner: fork.owner,
                  repo: fork.repo,
                  fullName: fork.fullName,
                  score: fork.score,
                  matches: result.matches,
                  reasoning: result.reasoning,
                  skipped: false,
                  completed,
                  total: forks.length,
                };
                results.push(resultData);
                send("result", resultData);
              } catch (error) {
                completed += 1;
                const result = {
                  owner: fork.owner,
                  repo: fork.repo,
                  fullName: fork.fullName,
                  score: fork.score,
                  matches: false,
                  reasoning: `Classifier error: ${errorMessage(error)}`,
                  skipped: true,
                  completed,
                  total: forks.length,
                };
                results.push(result);
                send("result", result);
              }
            })
          )
        );

        const doneData = { matched, total: forks.length };
        send("done", doneData);
        controller.close();

        // Cache the result
        setCachedResult(cacheKey, { start: startData, results, done: doneData });
      } catch (error) {
        send("error", { error: errorMessage(error) });
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
