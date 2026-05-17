import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondWithError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const PATCH_PREVIEW_MAX = 10000;

function parseJsonArray<T = unknown>(raw: string | null | unknown): T[] {
  if (!raw) return [];
  // Defensive: if already parsed (PocketBase json fields return objects), return as-is
  if (Array.isArray(raw)) return raw as T[];
  try {
    const value = JSON.parse(raw as string) as unknown;
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> }
) {
  const database = await getDb();
  try {
    const { owner, repo } = await params;
    const scanId = request.nextUrl.searchParams.get("scanId");

    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    const forks = await database.collection('forks').getList(1, 1, {
      filter: `scanId = "${scanId}" && owner = "${owner}" && repo = "${repo}"`,
    });

    if (forks.items.length === 0) {
      return NextResponse.json({ error: "Fork not found" }, { status: 404 });
    }

    const fork = forks.items[0];

    const diffs = await database.collection('diffs').getList(1, 1, {
      filter: `forkId = "${fork.id}"`,
    });

    const diff = diffs.items.length > 0 ? diffs.items[0] : null;

    return NextResponse.json({
      fork: {
        id: fork.id,
        owner: fork.owner,
        repo: fork.repo,
        fullName: fork.fullName,
        stars: fork.stars,
        aheadBy: fork.aheadBy,
        filesChanged: fork.filesChanged,
        linesAdded: fork.linesAdded,
        linesRemoved: fork.linesRemoved,
        score: fork.score,
        summary: fork.summary,
        updatedAt: fork.updatedAt,
        deepSummary: fork.deepSummary ?? null,
        deepSummaryGeneratedAt: fork.deepSummaryGeneratedAt ?? null,
      },
      diff: {
        status: diff?.status ?? "unknown",
        error: diff?.error ?? null,
        patch: diff?.patch ? diff.patch.substring(0, PATCH_PREVIEW_MAX) : "",
        topFiles: parseJsonArray(diff?.topFiles ?? null),
        commitsCount: diff?.commitsCount ?? 0,
        commits: parseJsonArray(fork.commitsJson),
      },
    });
  } catch (error: any) {
    if (error.status === 404) {
      return NextResponse.json({ error: "Fork not found" }, { status: 404 });
    }
    return respondWithError(error);
  }
}
