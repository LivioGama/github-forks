"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { ForkListRow } from "./ForkListRow";
import { POLL_INTERVAL_MS, fetcher, forkKey, isTerminal } from "./constants";
import type { Fork, ScanResponse } from "./types";
import { useAskForks } from "./useAskForks";
import { useScanProgressStream } from "./useScanProgressStream";

export interface ScanResultsProps {
  scanId: string;
}

export function ScanResults({ scanId }: ScanResultsProps) {
  const router = useRouter();
  const { progress, stage, isConnected } = useScanProgressStream(scanId);

  const { data, isLoading, mutate: mutateScan } = useSWR<ScanResponse>(
    `/api/scan/${scanId}`,
    fetcher,
    {
      refreshInterval: (latest) =>
        isTerminal(latest?.scan?.status) ? 0 : POLL_INTERVAL_MS,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  const forks = useMemo(() => data?.topForks ?? [], [data?.topForks]);

  const serverDeepSummaries = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of forks) {
      const k = forkKey(f.owner, f.repo);
      const text = f.deepSummary?.trim();
      if (text) m.set(k, text);
    }
    return m;
  }, [forks]);

  const [deepOverrides, setDeepOverrides] = useState<Map<string, string>>(new Map());

  const mergedDeepSummaries = useMemo(() => {
    const merged = new Map(serverDeepSummaries);
    for (const [k, v] of deepOverrides) merged.set(k, v);
    return merged;
  }, [serverDeepSummaries, deepOverrides]);

  const [deepAnalyzing, setDeepAnalyzing] = useState<Map<string, boolean>>(new Map());
  const [deepErrors, setDeepErrors] = useState<Map<string, string>>(new Map());
  const [deepPersistHints, setDeepPersistHints] = useState<Map<string, string>>(new Map());
  const [deepAnalysisExpanded, setDeepAnalysisExpanded] = useState<Record<string, boolean>>({});

  const ask = useAskForks(scanId);

  const openForkDetails = useCallback(
    (fork: Fork) => router.push(`/forks/${fork.owner}/${fork.repo}?scanId=${scanId}`),
    [router, scanId]
  );

  const runDeepAnalysis = useCallback(
    async (fork: Fork) => {
      const key = forkKey(fork.owner, fork.repo);
      setDeepAnalyzing((prev) => new Map(prev).set(key, true));
      setDeepErrors((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      setDeepPersistHints((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
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
        setDeepOverrides((prev) => new Map(prev).set(key, json.summary as string));
        if (json.persisted === false) {
          const lines = [json.persistError, json.persistHint].filter(
            (x): x is string => typeof x === "string" && x.length > 0
          );
          if (lines.length > 0) {
            setDeepPersistHints((prev) => new Map(prev).set(key, lines.join("\n")));
          }
        } else {
          setDeepPersistHints((prev) => {
            const next = new Map(prev);
            next.delete(key);
            return next;
          });
        }
        setDeepAnalysisExpanded((prev) => ({ ...prev, [key]: true }));
        await mutateScan();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        setDeepErrors((prev) => new Map(prev).set(key, msg));
      } finally {
        setDeepAnalyzing((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [scanId, mutateScan]
  );

  const visibleForks = useMemo(() => {
    if (!ask.activeQuestion || !ask.hideNonMatches) return forks;
    return forks.filter((fork) => ask.askResults.get(forkKey(fork.owner, fork.repo))?.matches);
  }, [forks, ask.askResults, ask.activeQuestion, ask.hideNonMatches]);

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8b949e]">Loading scan details...</p>
      </div>
    );
  }

  const status = data?.scan?.status;
  const askInputDisabled = !isTerminal(status) || ask.askPhase === "running";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">
          {data?.scan?.owner}/{data?.scan?.repo}
        </h2>
        <p className="text-[#8b949e]">
          {status === "completed" && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#1f3a25] text-[#3fb950] border border-[#238636] mr-2">
              Completed
            </span>
          )}
          {status === "running" && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#1c2128] text-[#58a6ff] border border-[#30363d] mr-2">
              Running
            </span>
          )}
          {status === "failed" && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#2d1b1b] text-[#f85149] border border-[#f85149] mr-2">
              Failed
            </span>
          )}
          {data?.scan?.totalForks ?? 0} forks found
        </p>
      </div>

      {!isTerminal(status) && (
        <div className="bg-[#161b22] rounded-md border border-[#30363d] p-6">
          <h3 className="font-semibold text-white mb-4">Scanning: {stage}</h3>
          <div className="w-full bg-[#30363d] rounded-full h-2">
            <div
              className="bg-[#58a6ff] h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-[#8b949e] mt-2">
            {progress}% complete
            {!isConnected && <span className="ml-2 text-[#d29922]">(reconnecting...)</span>}
          </p>
        </div>
      )}

      {isTerminal(status) && (
        <div className="bg-[#161b22] rounded-md border border-[#30363d] p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Ask about these forks</h3>
            {ask.activeQuestion && (
              <button
                type="button"
                onClick={ask.clearAsk}
                className="text-xs text-[#8b949e] hover:text-[#c9d1d9]"
              >
                Clear
              </button>
            )}
          </div>
          <p className="text-sm text-[#8b949e]">
            Ask a question; each fork with real changes is analyzed on its own to see if it matches.
            Example: <em>does one of these forks implement a web browser?</em>
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask.startAsk(ask.askInput);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={ask.askInput}
              onChange={(event) => ask.setAskInput(event.target.value)}
              placeholder="does one of these forks ..."
              disabled={askInputDisabled}
              className="flex-1 px-3 py-2 bg-[#0d1117] border border-[#30363d] rounded-md focus:outline-none focus:ring-2 focus:ring-[#58a6ff] text-[#c9d1d9] placeholder-[#484f58] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={askInputDisabled || ask.askInput.trim().length === 0}
              className="bg-[#238636] text-white font-medium py-2 px-4 rounded-md hover:bg-[#2ea043] disabled:bg-[#30363d] disabled:cursor-not-allowed transition"
            >
              {ask.askPhase === "running" ? "Asking..." : "Ask"}
            </button>
          </form>

          {ask.askPhase === "running" && ask.askProgress.total > 0 && (
            <div>
              <div className="w-full bg-[#30363d] rounded-full h-1.5">
                <div
                  className="bg-[#58a6ff] h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(ask.askProgress.completed / ask.askProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-xs text-[#8b949e] mt-2">
                Analyzed {ask.askProgress.completed} / {ask.askProgress.total} meaningful forks •
                <span className="text-[#3fb950] ml-1">
                  {ask.askMatched} match{ask.askMatched === 1 ? "" : "es"} so far
                </span>
              </p>
            </div>
          )}

          {ask.askPhase === "done" && ask.askProgress.total === 0 && (
            <p className="text-sm text-[#8b949e]">
              No forks with unique commits were found in this scan — all top forks appear to be at
              parity with the original. Try rescanning the repository to pick up recently-active
              forks with real changes.
            </p>
          )}

          {ask.askPhase === "done" && ask.askProgress.total > 0 && (
            <div className="flex items-center justify-between text-sm">
              <p className="text-[#8b949e]">
                Asked:{" "}
                <span className="text-[#c9d1d9] italic">{ask.activeQuestion}</span> •{" "}
                <span className="text-[#3fb950]">
                  {ask.askMatched} match{ask.askMatched === 1 ? "" : "es"}
                </span>{" "}
                across {ask.askProgress.total} fork
                {ask.askProgress.total === 1 ? "" : "s"}
              </p>
              {ask.askMatched > 0 && (
                <label className="flex items-center gap-2 text-xs text-[#8b949e] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ask.hideNonMatches}
                    onChange={(event) => ask.setHideNonMatches(event.target.checked)}
                    className="accent-[#58a6ff]"
                  />
                  Show matches only
                </label>
              )}
            </div>
          )}

          {ask.askPhase === "error" && ask.askError && (
            <p className="text-sm text-[#f85149]">Ask failed: {ask.askError}</p>
          )}
        </div>
      )}

      {isTerminal(status) && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white">Top Forks</h3>
          {forks.length === 0 ? (
            <div className="text-center py-12 border border-[#30363d] rounded-md bg-[#161b22]">
              <svg
                className="w-12 h-12 mx-auto text-[#8b949e]"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 1 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 0 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 0 1 1-1h8zM5 12.25v3.25a.25.25 0 0 0 .4.2l1.45-1.087a.25.25 0 0 1 .3 0L8.6 15.7a.25.25 0 0 0 .4-.2v-3.25a.25.25 0 0 0-.25-.25h-3.5a.25.25 0 0 0-.25.25z" />
              </svg>
              <p className="mt-4 text-[#c9d1d9] font-semibold">No significant forks</p>
              <p className="text-sm text-[#8b949e] mt-1">
                All forks are near-identical to the upstream.
              </p>
            </div>
          ) : visibleForks.length === 0 ? (
            <div className="text-center py-12 border border-[#30363d] rounded-md bg-[#161b22]">
              <svg
                className="w-12 h-12 mx-auto text-[#8b949e]"
                fill="currentColor"
                viewBox="0 0 16 16"
              >
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
              </svg>
              <p className="mt-4 text-[#c9d1d9] font-semibold">No matching forks</p>
              <p className="text-sm text-[#8b949e] mt-1">No forks match the current question.</p>
            </div>
          ) : (
            <div className="bg-[#161b22] rounded-md border border-[#30363d] divide-y divide-[#30363d]">
              {visibleForks.map((fork) => {
                const k = forkKey(fork.owner, fork.repo);
                const deepSummary = mergedDeepSummaries.get(k) ?? null;
                const deepExpanded = deepAnalysisExpanded[k] ?? false;
                const isDeepAnalyzing = deepAnalyzing.get(k);
                const deepError = deepErrors.get(k);
                const deepPersistHint = deepPersistHints.get(k);
                const askResult = ask.askResults.get(k);

                const hasDeepAnalysis = Boolean(deepSummary?.trim());

                return (
                  <ForkListRow
                    key={fork.id}
                    fork={fork}
                    activeQuestion={ask.activeQuestion}
                    askPhase={ask.askPhase}
                    askResult={askResult}
                    openForkDetails={openForkDetails}
                    deepSummary={deepSummary}
                    deepExpanded={deepExpanded}
                    deepPersistHint={deepPersistHint}
                    deepError={deepError}
                    isDeepAnalyzing={isDeepAnalyzing}
                    onRegenerateDeep={() => void runDeepAnalysis(fork)}
                    onDeepPrimaryClick={() => {
                      if (hasDeepAnalysis && !isDeepAnalyzing) {
                        setDeepAnalysisExpanded((prev) => ({
                          ...prev,
                          [k]: !(prev[k] ?? false),
                        }));
                        return;
                      }
                      void runDeepAnalysis(fork);
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {status === "failed" && (
        <div className="p-4 bg-[#3d2222] border border-[#f85149] rounded-md text-[#f85149]">
          {data?.scan?.error || "Scan failed"}
        </div>
      )}
    </div>
  );
}
