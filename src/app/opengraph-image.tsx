import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "GitHub Fork Intelligence — Find Meaningful Forks";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
          color: "#c9d1d9",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            color: "#ffffff",
            fontSize: 32,
            fontWeight: 600,
          }}
        >
          <svg width="48" height="48" fill="#ffffff" viewBox="0 0 16 16">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>GitHub Fork Intelligence</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
            }}
          >
            Find Meaningful Forks
          </div>
          <div
            style={{
              fontSize: 32,
              color: "#8b949e",
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            Scan every fork. Drop the noise. Ask the diffs questions in
            plain English.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            fontSize: 22,
            color: "#8b949e",
          }}
        >
          <span
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              background: "#1f3a25",
              color: "#3fb950",
              border: "1px solid #238636",
            }}
          >
            semantic ask
          </span>
          <span
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              background: "#0c2d6b",
              color: "#58a6ff",
              border: "1px solid #1f6feb",
            }}
          >
            diff intelligence
          </span>
          <span
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              background: "#161b22",
              color: "#c9d1d9",
              border: "1px solid #30363d",
            }}
          >
            open source
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
