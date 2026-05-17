import { useEffect, useState } from "react";

export function useScanProgressStream(scanId: string) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("initializing");
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/scan/${scanId}/status`);

    eventSource.addEventListener("open", () => setIsConnected(true));

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.stage) {
          setStage(payload.stage);
          setProgress(payload.progress ?? 0);
        }
      } catch {
        // malformed event — ignore
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
    };

    return () => eventSource.close();
  }, [scanId]);

  return { progress, stage, isConnected };
}
