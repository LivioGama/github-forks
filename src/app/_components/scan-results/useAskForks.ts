import { useCallback, useEffect, useRef, useState } from "react";
import type { AskPhase, AskResult } from "./types";
import { forkKey } from "./constants";

export function useAskForks(scanId: string) {
  const [askInput, setAskInput] = useState("");
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [askPhase, setAskPhase] = useState<AskPhase>("idle");
  const [askError, setAskError] = useState<string | null>(null);
  const [askResults, setAskResults] = useState<Map<string, AskResult>>(new Map());
  const [askProgress, setAskProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [askMatched, setAskMatched] = useState(0);
  const [hideNonMatches, setHideNonMatches] = useState(false);
  const askSourceRef = useRef<EventSource | null>(null);

  const closeAskStream = useCallback(() => {
    if (askSourceRef.current) {
      askSourceRef.current.close();
      askSourceRef.current = null;
    }
  }, []);

  useEffect(() => () => closeAskStream(), [closeAskStream]);

  const startAsk = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      closeAskStream();

      setActiveQuestion(trimmed);
      setAskPhase("running");
      setAskError(null);
      setAskResults(new Map());
      setAskProgress({ completed: 0, total: 0 });
      setAskMatched(0);

      const source = new EventSource(
        `/api/forks/ask?scanId=${encodeURIComponent(scanId)}&q=${encodeURIComponent(trimmed)}`
      );
      askSourceRef.current = source;

      source.addEventListener("start", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          setAskProgress({ completed: 0, total: payload.total ?? 0 });
        } catch {
          // ignore malformed
        }
      });

      source.addEventListener("result", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          setAskResults((prev) => {
            const next = new Map(prev);
            next.set(forkKey(payload.owner, payload.repo), {
              matches: !!payload.matches,
              reasoning: payload.reasoning ?? "",
              skipped: !!payload.skipped,
            });
            return next;
          });
          setAskProgress({
            completed: payload.completed ?? 0,
            total: payload.total ?? 0,
          });
          if (payload.matches) setAskMatched((m) => m + 1);
        } catch {
          // ignore malformed
        }
      });

      source.addEventListener("done", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          setAskMatched(payload.matched ?? 0);
        } catch {
          // ignore malformed
        }
        setAskPhase("done");
        source.close();
        askSourceRef.current = null;
      });

      source.addEventListener("error", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          setAskError(payload.error ?? "Stream error");
        } catch {
          setAskError("Connection lost");
        }
        setAskPhase("error");
        source.close();
        askSourceRef.current = null;
      });
    },
    [scanId, closeAskStream]
  );

  const clearAsk = useCallback(() => {
    closeAskStream();
    setActiveQuestion(null);
    setAskPhase("idle");
    setAskError(null);
    setAskResults(new Map());
    setAskProgress({ completed: 0, total: 0 });
    setAskMatched(0);
    setHideNonMatches(false);
  }, [closeAskStream]);

  return {
    askInput,
    setAskInput,
    activeQuestion,
    askPhase,
    askError,
    askResults,
    askProgress,
    askMatched,
    hideNonMatches,
    setHideNonMatches,
    startAsk,
    clearAsk,
  };
}
