"use client";

import { MarkdownBody } from "@/app/_components/MarkdownBody";
import type { AskResult, Fork } from "./types";

export interface ForkListRowProps {
  fork: Fork;
  activeQuestion: string | null;
  askPhase: string;
  askResult: AskResult | undefined;
  openForkDetails: (fork: Fork) => void;
  deepSummary: string | null;
  deepExpanded: boolean;
  deepPersistHint: string | undefined;
  deepError: string | undefined;
  isDeepAnalyzing: boolean | undefined;
  onRegenerateDeep: () => void;
  onDeepPrimaryClick: () => void;
}

export function ForkListRow({
  fork,
  activeQuestion,
  askPhase,
  askResult,
  openForkDetails,
  deepSummary,
  deepExpanded,
  deepPersistHint,
  deepError,
  isDeepAnalyzing,
  onRegenerateDeep,
  onDeepPrimaryClick,
}: ForkListRowProps) {
  const isAnalyzing =
    Boolean(activeQuestion) && !askResult && askPhase === "running" && fork.aheadBy > 0;
  const notAnalyzable = Boolean(activeQuestion) && fork.aheadBy === 0;

  let badge: { label: string; cls: string } | null = null;
  if (askResult?.matches) {
    badge = {
      label: "✓ match",
      cls: "bg-[#1f3a25] text-[#3fb950] border-[#238636]",
    };
  } else if (askResult && !askResult.matches && !askResult.skipped) {
    badge = {
      label: "no match",
      cls: "bg-[#161b22] text-[#8b949e] border-[#30363d]",
    };
  } else if (askResult?.skipped) {
    badge = {
      label: "skipped",
      cls: "bg-[#161b22] text-[#8b949e] border-[#30363d]",
    };
  } else if (isAnalyzing) {
    badge = {
      label: "analyzing...",
      cls: "bg-[#161b22] text-[#58a6ff] border-[#30363d] animate-pulse",
    };
  } else if (notAnalyzable) {
    badge = {
      label: "no changes",
      cls: "bg-[#161b22] text-[#8b949e] border-[#30363d]",
    };
  }

  const dim =
    Boolean(activeQuestion) && askResult && !askResult.matches && askPhase === "done";

  const hasDeepAnalysis = Boolean(deepSummary?.trim());

  return (
    <div
      className={`px-4 py-4 flex items-start justify-between gap-4 hover:bg-[#1c2128] transition ${
        dim ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {/* GitHub serves lightweight avatar PNGs; Next/Image remote config is heavier than benefit here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://github.com/${fork.owner}.png?size=32`}
          alt=""
          className="w-8 h-8 rounded-full mr-3 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => openForkDetails(fork)}
              className="font-semibold text-[#58a6ff] hover:text-[#79c0ff] hover:underline text-left"
            >
              {fork.owner}/{fork.repo}
            </button>
            {badge && (
              <span className={`text-xs px-2 py-0.5 rounded border ${badge.cls}`}>{badge.label}</span>
            )}
          </div>
          <p className="text-sm text-[#8b949e] mt-1">{fork.summary}</p>
          {askResult?.reasoning && !askResult.skipped && (
            <p
              className={`text-sm mt-1 ${askResult.matches ? "text-[#3fb950]" : "text-[#8b949e]"}`}
            >
              {askResult.matches ? "→ " : ""}
              {askResult.reasoning}
            </p>
          )}
          {deepSummary && deepExpanded && (
            <div className="mt-3 p-3 bg-[#0d1117] border border-[#30363d] rounded-md">
              <MarkdownBody content={deepSummary} />
              <p className="text-[10px] text-[#8b949e] mt-2">
                Gemini 2.5 Flash
                {deepPersistHint ? " • not saved to database" : " • saved"}
              </p>
              {deepPersistHint && (
                <p className="text-[10px] text-[#d29922] mt-1">{deepPersistHint}</p>
              )}
            </div>
          )}
          {deepError && <div className="mt-2 text-xs text-[#f85149]">{deepError}</div>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div className="flex flex-wrap gap-3">
          <span className="text-xs text-[#8b949e]">
            <span className="font-medium text-[#c9d1d9]">{fork.aheadBy}</span> commits
          </span>
          <span className="text-xs text-[#8b949e]">
            <span className="font-medium text-[#c9d1d9]">{fork.filesChanged}</span> files
          </span>
          <span className="text-xs text-[#8b949e]">
            <span className="font-medium text-[#c9d1d9]">{fork.stars}</span> stars
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {hasDeepAnalysis && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRegenerateDeep();
              }}
              disabled={isDeepAnalyzing}
              className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#c9d1d9] hover:border-[#58a6ff] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isDeepAnalyzing ? "Regenerating..." : "Regenerate"}
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeepPrimaryClick();
            }}
            disabled={isDeepAnalyzing}
            className="text-xs px-2 py-1 rounded border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] hover:border-[#58a6ff] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isDeepAnalyzing
              ? hasDeepAnalysis
                ? "Regenerating..."
                : "Analyzing..."
              : hasDeepAnalysis
                ? deepExpanded
                  ? "Hide analysis"
                  : "Show Analysis"
                : "Analyze with Gemini"}
          </button>
        </div>
      </div>
    </div>
  );
}
