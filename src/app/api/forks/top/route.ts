import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { respondWithError } from "@/lib/api/respond";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(raw: string | null): number {
  const parsed = raw === null ? DEFAULT_LIMIT : parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const scanId = params.get("scanId");

    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    const limit = parseLimit(params.get("limit"));
    const database = await getDb();

    const result = await database.collection('forks').getList(1, limit, {
      filter: `scanId = "${scanId}"`,
      sort: '-score',
    });

    return NextResponse.json({
      scanId,
      count: result.items.length,
      forks: result.items.map((fork: any) => ({
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
        topFiles: parseTopFiles(fork.topFiles),
        updatedAt: fork.updatedAt,
      })),
    });
  } catch (error) {
    return respondWithError(error);
  }
}

function parseTopFiles(raw: string | null): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
