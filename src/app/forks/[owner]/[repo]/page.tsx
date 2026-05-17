"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { MarkdownBody } from "@/app/_components/MarkdownBody";

interface TopFile {
  filename: string;
  additions: number;
  deletions: number;
  language?: string;
}

interface CommitMetadata {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface DiffSummaryResponse {
  fork: {
    id: string;
    owner: string;
    repo: string;
    fullName: string;
    stars: number;
    aheadBy: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    score: number;
    summary: string;
    updatedAt: string;
    deepSummary?: string | null;
    deepSummaryGeneratedAt?: string | null;
  };
  diff: {
    status: string;
    error: string | null;
    patch: string;
    topFiles: TopFile[];
    commitsCount: number;
    commits: CommitMetadata[];
  };
  error?: string;
}

const fetcher = (url: string) => fetch(url).then((response) => response.json());

interface ForkDetailLoadedProps {
  fork: DiffSummaryResponse["fork"];
  diff: DiffSummaryResponse["diff"];
  scanId: string;
  mutate: ReturnType<typeof useSWR<DiffSummaryResponse>>["mutate"];
  backButton: ReactNode;
}

function ForkDetailLoaded({
  fork,
  diff,
  scanId,
  mutate,
  backButton,
}: ForkDetailLoadedProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);

  const runDeepAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const res = await fetch(`/api/forks/${fork.owner}/${fork.repo}/deep-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed with status ${res.status}`);
      }

      const json = await res.json();
      await mutate(
        (current) =>
          current
            ? {
                ...current,
                fork: {
                  ...current.fork,
                  deepSummary: json.summary,
                  deepSummaryGeneratedAt: json.generatedAt ?? new Date().toISOString(),
                },
              }
            : current,
        { revalidate: true }
      );
      setAnalysisExpanded(true);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const hasDeepAnalysis = Boolean(fork.deepSummary?.trim());

  return (
    <div className="space-y-8">
      {backButton}

      <div>
        <h2 className="text-3xl font-bold text-white mb-2">
          {fork.owner}/{fork.repo}
        </h2>
        <p className="text-[#c9d1d9] mb-2">{fork.summary}</p>
        <a
          href={`https://github.com/${fork.owner}/${fork.repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#58a6ff] hover:text-[#79c0ff] text-sm font-medium"
        >
          View on GitHub →
        </a>
      </div>

      <div className="bg-[#161b22] rounded-md border border-[#30363d] p-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-[#8b949e]">Ahead</p>
            <p className="font-semibold text-[#c9d1d9]">{fork.aheadBy} commits</p>
          </div>
          <div>
            <p className="text-[#8b949e]">Files Changed</p>
            <p className="font-semibold text-[#c9d1d9]">{fork.filesChanged}</p>
          </div>
          <div>
            <p className="text-[#8b949e]">Lines Added</p>
            <p className="font-semibold text-[#3fb950]">+{fork.linesAdded}</p>
          </div>
          <div>
            <p className="text-[#8b949e]">Lines Removed</p>
            <p className="font-semibold text-[#f85149]">-{fork.linesRemoved}</p>
          </div>
          <div>
            <p className="text-[#8b949e]">Stars</p>
            <p className="font-semibold text-[#c9d1d9]">{fork.stars}</p>
          </div>
        </div>
      </div>

      {diff.status === "failed" && (
        <div className="p-4 bg-[#3d2222] border border-[#f85149] rounded-md text-[#f85149]">
          Diff extraction failed: {diff.error || "unknown error"}
        </div>
      )}

      {diff.status !== "extracted" && diff.status !== "failed" && (
        <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-md text-[#8b949e]">
          No diff details available — this fork has no changes ahead of upstream, or the comparison
          could not be retrieved.
        </div>
      )}

      {diff.topFiles.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">Top Changed Files</h3>
          <div className="bg-[#161b22] rounded-md border border-[#30363d] divide-y divide-[#30363d]">
            {diff.topFiles.map((file) => (
              <div
                key={file.filename}
                className="flex justify-between items-center px-6 py-3 text-sm"
              >
                <span className="font-mono text-[#c9d1d9] truncate">
                  {file.filename}
                  {file.language && <span className="ml-2 text-[#8b949e]">{file.language}</span>}
                </span>
                <span className="shrink-0 ml-4 font-mono">
                  <span className="text-[#3fb950]">+{file.additions}</span>{" "}
                  <span className="text-[#f85149]">-{file.deletions}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {diff.commits.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">Commits ({diff.commitsCount})</h3>
          <div className="bg-[#161b22] rounded-md border border-[#30363d] divide-y divide-[#30363d]">
            {diff.commits.map((commit, index) => (
              <div key={commit.sha ?? index} className="px-6 py-3 text-sm">
                <p className="text-[#c9d1d9]">{commit.message.split("\n")[0]}</p>
                <p className="text-[#8b949e] text-xs mt-1">
                  {commit.author}
                  {commit.sha && (
                    <a
                      href={`https://github.com/${fork.owner}/${fork.repo}/commit/${commit.sha}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[#58a6ff] hover:underline ml-2"
                    >
                      {commit.sha.substring(0, 7)}
                    </a>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {diff.patch && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">Diff Preview</h3>
          <div className="bg-[#161b22] border border-[#30363d] rounded-md overflow-x-auto overflow-y-auto max-h-[600px]">
            {diff.patch.split("\n").map((line, i) => (
              <div
                key={i}
                className={`px-4 font-mono text-xs whitespace-pre ${
                  line.startsWith("+") && !line.startsWith("+++")
                    ? "bg-[#1c2b20] text-[#3fb950]"
                    : line.startsWith("-") && !line.startsWith("---")
                      ? "bg-[#2d1b1b] text-[#f85149]"
                      : line.startsWith("@@")
                        ? "bg-[#1b2738] text-[#58a6ff]"
                        : "text-[#c9d1d9]"
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-white">Deep Analysis</h3>
          <div className="flex flex-wrap items-center gap-2">
            {hasDeepAnalysis && (
              <button
                type="button"
                onClick={() => void runDeepAnalysis()}
                disabled={analyzing || !scanId}
                className="px-3 py-2 rounded-md text-sm font-medium border border-[#30363d] text-[#c9d1d9] hover:border-[#58a6ff] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {analyzing ? "Regenerating..." : "Regenerate"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (hasDeepAnalysis && !analyzing) {
                  setAnalysisExpanded((open) => !open);
                  return;
                }
                void runDeepAnalysis();
              }}
              disabled={analyzing || !scanId}
              className="px-4 py-2 rounded-md text-sm font-medium bg-[#238636] text-white hover:bg-[#2ea043] disabled:bg-[#30363d] disabled:cursor-not-allowed transition"
            >
              {analyzing
                ? hasDeepAnalysis
                  ? "Regenerating..."
                  : "Analyzing with Gemini Flash..."
                : hasDeepAnalysis
                  ? analysisExpanded
                    ? "Hide analysis"
                    : "Show Analysis"
                  : "Analyze with Gemini Flash"}
            </button>
          </div>
        </div>

        {analysisError && (
          <div className="p-4 bg-[#3d2222] border border-[#f85149] rounded-md text-[#f85149] text-sm">
            {analysisError}
          </div>
        )}

        {fork.deepSummary && analysisExpanded && (
          <div className="bg-[#161b22] border border-[#30363d] rounded-md p-6">
            <MarkdownBody content={fork.deepSummary} />
            <p className="text-[10px] text-[#8b949e] mt-4">
              Generated by Gemini 2.5 Flash
              {fork.deepSummaryGeneratedAt
                ? ` • ${new Date(fork.deepSummaryGeneratedAt).toLocaleString()}`
                : ""}
              {" • "}
              Analysis is AI-generated and may contain inaccuracies.
            </p>
          </div>
        )}

        {!analyzing && !analysisError && (
          <p className="text-sm text-[#8b949e]">
            {hasDeepAnalysis
              ? analysisExpanded
                ? "Use Regenerate to run Gemini again with the latest diff data."
                : "Use Show Analysis to expand the saved summary, or Regenerate to run Gemini again."
              : "Click Analyze with Gemini Flash for a comprehensive, structured summary of everything this fork changes and accomplishes."}
          </p>
        )}
      </div>
    </div>
  );
}

function ForkDetailContent() {
  const params = useParams<{ owner: string; repo: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const scanId = searchParams.get("scanId");

  const { owner, repo } = params;

  const { data, isLoading, mutate } = useSWR<DiffSummaryResponse>(
    scanId ? `/api/forks/${owner}/${repo}/diff-summary?scanId=${scanId}` : null,
    fetcher,
    { revalidateOnFocus: true }
  );

  const backButton = scanId ? (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => router.push(`/forks?scanId=${scanId}`)}
        className="text-[#58a6ff] hover:text-[#79c0ff] font-medium"
      >
        ← Back to results
      </button>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="text-[#8b949e] hover:text-[#c9d1d9] font-medium"
      >
        Home
      </button>
    </div>
  ) : null;

  if (!scanId) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8b949e] mb-4">No scan ID provided</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="bg-[#238636] text-white px-4 py-2 rounded-md hover:bg-[#2ea043] transition"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8b949e]">Loading fork details...</p>
      </div>
    );
  }

  if (!data || data.error || !data.fork) {
    return (
      <div className="space-y-4">
        {backButton}
        <div className="p-4 bg-[#3d2222] border border-[#f85149] rounded-md text-[#f85149]">
          {data?.error || "Fork not found"}
        </div>
      </div>
    );
  }

  return (
    <ForkDetailLoaded
      key={data.fork.id}
      fork={data.fork}
      diff={data.diff}
      scanId={scanId}
      mutate={mutate}
      backButton={backButton}
    />
  );
}

export default function ForkDetailPage() {
  return (
    <Suspense
      fallback={<div className="text-center py-12 text-[#8b949e]">Loading...</div>}
    >
      <ForkDetailContent />
    </Suspense>
  );
}
