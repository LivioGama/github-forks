"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RepoHistory {
  url: string;
  timestamp: number;
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

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState<RepoHistory[]>(loadRepoHistory);

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

  const handleHistoryClick = (url: string) => {
    const parsed = parseGitHubUrl(url);
    if (parsed) {
      router.push(`/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const clearHistory = () => {
    localStorage.removeItem("repoHistory");
    setHistory([]);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Scan History</h1>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-[#58a6ff] hover:text-[#79c0ff] font-medium"
        >
          ← Back to Home
        </button>
      </div>

      {history.length === 0 ? (
        <div className="p-8 bg-[#161b22] rounded-md border border-[#30363d] text-center">
          <p className="text-[#8b949e]">No scan history yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearHistory}
              className="text-[#f85149] hover:text-[#ff7b72] text-sm font-medium"
            >
              Clear History
            </button>
          </div>

          <div className="bg-[#161b22] rounded-md border border-[#30363d] divide-y divide-[#30363d]">
            {history.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleHistoryClick(item.url)}
                className="w-full text-left px-6 py-4 hover:bg-[#21262d] transition flex items-center justify-between group"
              >
                <div className="flex-1">
                  <p className="text-[#c9d1d9] font-medium">{item.url}</p>
                  <p className="text-[#8b949e] text-sm mt-1">{formatDate(item.timestamp)}</p>
                </div>
                <svg
                  className="w-5 h-5 text-[#8b949e] group-hover:text-[#58a6ff]"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
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
    </div>
  );
}
