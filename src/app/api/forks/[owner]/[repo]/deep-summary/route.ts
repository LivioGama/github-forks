import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { ensureForksGeminiFields } from "@/lib/db/ensure-forks-gemini-fields";
import { respondWithError } from "@/lib/api/respond";
import { generateDeepForkSummary } from "@/lib/gemini/client";
import { errorMessage } from "@/lib/errors";
import type { CommitMetadata, TopFile } from "@/types";

export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ owner: string; repo: string }> }) {
  try {
    const database = await getDb();
    const { owner, repo } = await params;
    const { scanId } = await request.json();

    if (!scanId) {
      return NextResponse.json({ error: "scanId is required" }, { status: 400 });
    }

    // Find the fork record
    const forks = await database.collection("forks").getList(1, 1, {
      ...PB_NO_CANCEL,
      filter: `scanId = "${scanId}" && owner = "${owner}" && repo = "${repo}"`,
    });

    if (forks.items.length === 0) {
      return NextResponse.json({ error: "Fork not found for this scan" }, { status: 404 });
    }

    const fork = forks.items[0];

    // Fetch associated diff (full patch)
    const diffs = await database.collection("diffs").getList(1, 1, {
      ...PB_NO_CANCEL,
      filter: `forkId = "${fork.id}"`,
    });

    const diff = diffs.items[0] ?? null;

    const commits = parseJsonArray<CommitMetadata>(fork.commitsJson);

    const forkData = {
      owner: fork.owner as string,
      repo: fork.repo as string,
      fullName: fork.fullName as string | undefined,
      stars: fork.stars as number | undefined,
      aheadBy: fork.aheadBy as number | undefined,
      filesChanged: fork.filesChanged as number | undefined,
      linesAdded: fork.linesAdded as number | undefined,
      linesRemoved: fork.linesRemoved as number | undefined,
      summary: fork.summary as string | undefined,
    };

    const diffData =
      diff != null
        ? {
            patch: (diff.patch as string | undefined) ?? "",
            topFiles: parseJsonArray<TopFile>(diff.topFiles),
          }
        : { patch: "", topFiles: [] as TopFile[] };

    const deepSummary = await generateDeepForkSummary(forkData, diffData, commits);

    // Persist the analysis so it survives page reloads and is available to other views
    const generatedAt = new Date().toISOString();
    const payload = {
      deepSummary,
      deepSummaryGeneratedAt: generatedAt,
    };

    let persisted = true;
    let persistError: string | null = null;

    try {
      await ensureForksGeminiFields(database);
    } catch (ensureErr) {
      console.warn("ensureForksGeminiFields (non-fatal):", errorMessage(ensureErr));
    }

    try {
      await database.collection("forks").update(fork.id, payload);
    } catch (firstErr) {
      const firstMsg = errorMessage(firstErr);
      console.error("Persist deep summary failed:", firstErr);
      try {
        const schemaUpdated = await ensureForksGeminiFields(database);
        if (schemaUpdated) {
          await database.collection("forks").update(fork.id, payload);
          persisted = true;
        } else {
          persisted = false;
          persistError = firstMsg;
        }
      } catch (retryErr) {
        console.error("Persist deep summary retry failed:", retryErr);
        persisted = false;
        persistError = errorMessage(retryErr);
      }
    }

    return NextResponse.json({
      summary: deepSummary,
      generatedAt,
      persisted,
      ...(persisted
        ? {}
        : {
            persistError,
            persistHint:
              "Saving failed. Check `persistError` for the PocketBase message. If fields are missing, run `bun run pb:add-fork-gemini-fields` or increase the `deepSummary` field max length in Admin.",
          }),
    });
  } catch (error) {
    console.error("Deep summary generation failed:", error);
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: 500 }
    );
  }
}
