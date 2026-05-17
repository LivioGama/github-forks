"use client";

import { useState, useEffect, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface RepoHistory {
  url: string;
  timestamp: number;
}

interface ScanStatus {
  status: string;
  progress: number;
  message: string;
  totalForks: number;
  processedForks: number;
}

function loadRepoHistory(): RepoHistory[] {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem("repoHistory");
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved);
    const uniqueHistory = Array.from(
      new Map(parsed.map((item: RepoHistory) => [item.url, item])).values()
    );
    return uniqueHistory as RepoHistory[];
  } catch {
    return [];
  }
}

export function HomePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoFromUrl = searchParams.get("repo") ?? "";
  const [repoUrl, setRepoUrl] = useState(repoFromUrl);
  const [githubToken, setGithubToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [history, setHistory] = useState<RepoHistory[]>(loadRepoHistory);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const q = searchParams.get("repo");
    if (q) startTransition(() => setRepoUrl(q));
  }, [searchParams]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault();

        localStorage.removeItem("repoHistory");
        setHistory([]);

        try {
          await fetch("/api/clear", { method: "POST" });
        } catch {
          /* hidden shortcut — avoid logging in client bundles */
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!scanId || !showModal) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/scan/${scanId}`);
        if (response.ok) {
          const data = await response.json();
          setScanStatus(data.scan);

          if (data.scan.status === "completed") {
            clearInterval(pollInterval);
            setTimeout(() => {
              router.push(
                `/${encodeURIComponent(data.scan.owner)}/${encodeURIComponent(data.scan.repo)}`
              );
            }, 1000);
          } else if (data.scan.status === "failed") {
            clearInterval(pollInterval);
            setError(data.scan.error || "Scan failed");
            setShowModal(false);
          }
        }
      } catch {
        /* polling is best-effort; modal keeps last known status */
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [scanId, showModal, router]);

  const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
    try {
      const normalized = url.trim();

      const urlMatch = normalized.match(/github\.com\/([^\/]+)\/([^\/\s]+)/);
      if (urlMatch) {
        return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
      }

      if (normalized.includes("/")) {
        const parts = normalized.split("/");
        if (parts.length >= 2) {
          const owner = parts[0].trim();
          const repo = parts[1].trim().replace(/\.git$/, "");
          if (owner && repo) {
            return { owner, repo };
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  };

  const handleRepoUrlChange = (value: string) => {
    setRepoUrl(value);
    if (error) setError("");
  };

  const handleHistoryClick = (url: string) => {
    const parsed = parseGitHubUrl(url);
    if (parsed) {
      router.push(`/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      setError("Invalid GitHub URL. Use format: owner/repo or https://github.com/owner/repo");
      setLoading(false);
      return;
    }

    const { owner, repo } = parsed;

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo, githubToken: githubToken.trim() || undefined }),
      });

      if (!response.ok) {
        throw new Error("Failed to start scan");
      }

      const normalizedUrl = `${owner}/${repo}`;
      const exists = history.some((item) => {
        const p = parseGitHubUrl(item.url);
        return p && `${p.owner}/${p.repo}` === normalizedUrl;
      });

      if (!exists) {
        const newHistory = [{ url: normalizedUrl, timestamp: Date.now() }, ...history.slice(0, 9)];
        localStorage.setItem("repoHistory", JSON.stringify(newHistory));
        setHistory(newHistory);
      }

      const data = await response.json();
      setScanId(data.jobId);
      setScanStatus({
        status: "running",
        progress: 0,
        message: "Initializing...",
        totalForks: 0,
        processedForks: 0,
      });
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error starting scan");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <p className="text-sm text-[#8b949e] mb-4">
          Analyze all forks of a GitHub repository to discover which ones contain interesting,
          non-trivial changes. Filter by semantic meaning and rank by relevance.
        </p>
        <p className="text-sm text-[#c9d1d9] mb-4 p-3 rounded-md border border-[#30363d] bg-[#161b22]">
          <span className="font-medium text-[#58a6ff]">Tip:</span> On GitHub, replace{" "}
          <code className="text-[#79c0ff] bg-[#0d1117] px-1 rounded">github.com</code> with{" "}
          <code className="text-[#79c0ff] bg-[#0d1117] px-1 rounded">forks-github.devliv.io</code>{" "}
          in the address bar (keep{" "}
          <code className="text-[#79c0ff] bg-[#0d1117] px-1 rounded">/owner/repo</code>)—then paste the repo
          below or start a scan from here.
        </p>
        <form
          onSubmit={handleSubmit}
          className="bg-[#161b22] rounded-md border border-[#30363d] p-6 space-y-6"
        >
          <div>
            <label htmlFor="repoUrl" className="block text-sm font-medium text-[#c9d1d9] mb-2">
              Repository URL
            </label>
            <input
              id="repoUrl"
              type="text"
              value={repoUrl}
              onChange={(e) => handleRepoUrlChange(e.target.value)}
              placeholder="e.g., https://github.com/vercel/next.js or vercel/next.js"
              className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-md focus:outline-none focus:ring-2 focus:ring-[#58a6ff] text-[#c9d1d9] placeholder-[#484f58]"
              disabled={loading}
            />
            <p className="mt-1 text-sm text-[#8b949e]">
              Paste a GitHub repository URL or use owner/repo format
            </p>
          </div>

          {error && (
            <>
              <div className="p-4 bg-[#3d2222] border border-[#f85149] rounded-md text-[#f85149]">
                {error}
              </div>
              <div className="space-y-2">
                <label htmlFor="githubToken" className="block text-sm font-medium text-[#c9d1d9]">
                  GitHub Personal Access Token (optional)
                </label>
                <input
                  id="githubToken"
                  type="password"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_... or fine-grained token"
                  className="w-full px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-md focus:outline-none focus:ring-2 focus:ring-[#58a6ff] text-[#c9d1d9] placeholder-[#484f58] font-mono text-sm"
                  disabled={loading}
                  autoComplete="off"
                />
                <p className="text-sm text-[#8b949e]">
                  Rate limit exceeded with the embedded token? Provide your own PAT to continue.
                  Token is used only for this scan and never stored.
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !repoUrl}
              className="bg-[#238636] text-white font-medium py-2 px-4 rounded-md hover:bg-[#2ea043] disabled:bg-[#30363d] disabled:cursor-not-allowed transition"
            >
              {loading ? "Starting..." : "Start Scan"}
            </button>
          </div>

          {history.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-[#c9d1d9]">
                  Recent repositories
                </label>
                {history.length > 10 && (
                  <button
                    type="button"
                    onClick={() => router.push("/history")}
                    className="text-[#58a6ff] hover:text-[#79c0ff] text-sm font-medium flex items-center gap-1"
                  >
                    View all
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                      <path
                        fillRule="evenodd"
                        d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {history.slice(0, 10).map((item, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleHistoryClick(item.url)}
                    className="w-full text-left px-3 py-2 text-sm bg-[#0d1117] hover:bg-[#21262d] rounded-md border border-[#30363d] transition text-[#c9d1d9] flex items-center justify-between"
                  >
                    <span>{item.url}</span>
                    <svg className="w-4 h-4 text-[#8b949e]" fill="currentColor" viewBox="0 0 16 16">
                      <path
                        fillRule="evenodd"
                        d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-12">
        <div className="p-6 bg-[#161b22] rounded-md border border-[#30363d]">
          <h4 className="font-semibold text-[#58a6ff] mb-2">
            <svg className="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
            </svg>
            Discovery
          </h4>
          <p className="text-sm text-[#8b949e]">
            Automatically fetches all forks with pagination handling.
          </p>
        </div>
        <div className="p-6 bg-[#161b22] rounded-md border border-[#30363d]">
          <h4 className="font-semibold text-[#3fb950] mb-2">
            <svg className="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 16 16">
              <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zM2.5 2a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zM1 10.5A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3zm6.5.5A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3zm1.5-.5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3z" />
            </svg>
            Analysis
          </h4>
          <p className="text-sm text-[#8b949e]">
            Extracts diffs, commits, and file changes with rate limiting.
          </p>
        </div>
        <div className="p-6 bg-[#161b22] rounded-md border border-[#30363d]">
          <h4 className="font-semibold text-[#a371f7] mb-2">
            <svg className="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
            </svg>
            Ranking
          </h4>
          <p className="text-sm text-[#8b949e]">
            Scores forks by commits, changes, recency, and semantic relevance.
          </p>
        </div>
      </section>

      {showModal && scanStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-[#161b22] rounded-lg border border-[#30363d] p-8 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold text-white mb-4">Scanning Repository</h3>
            <div className="space-y-4">
              <div className="flex justify-between text-sm text-[#c9d1d9]">
                <span>{scanStatus.message}</span>
                <span>{scanStatus.progress}%</span>
              </div>
              <div className="w-full bg-[#0d1117] rounded-full h-2">
                <div
                  className="bg-[#238636] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${scanStatus.progress}%` }}
                ></div>
              </div>
              <div className="text-sm text-[#8b949e]">
                {scanStatus.totalForks > 0 && (
                  <span>
                    {scanStatus.processedForks} / {scanStatus.totalForks} forks processed
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
