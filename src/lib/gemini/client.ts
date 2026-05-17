import type { CommitMetadata, TopFile } from "@/types";

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_CONTEXT_CHARS = 120_000;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

/** Minimal fork fields persisted for deep-summary context */
export interface DeepSummaryForkFields {
  fullName?: string | null;
  owner: string;
  repo: string;
  stars?: number | null;
  aheadBy?: number | null;
  filesChanged?: number | null;
  linesAdded?: number | null;
  linesRemoved?: number | null;
  summary?: string | null;
}

export interface DeepSummaryDiffFields {
  topFiles?: TopFile[] | null;
  patch?: string | null;
}

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return key;
}

function buildContext(
  fork: DeepSummaryForkFields,
  diff: DeepSummaryDiffFields,
  commits: CommitMetadata[]
): string {
  const lines: string[] = [];

  lines.push(`Fork: ${fork.fullName || `${fork.owner}/${fork.repo}`}`);
  lines.push(
    `Stars: ${fork.stars ?? 0} | Ahead: ${fork.aheadBy ?? 0} commits | Files changed: ${fork.filesChanged ?? 0}`
  );
  lines.push(`Lines: +${fork.linesAdded ?? 0} / -${fork.linesRemoved ?? 0}`);
  lines.push(`Existing short summary: ${fork.summary || "(none)"}`);
  lines.push("");

  if (commits.length > 0) {
    lines.push("Recent commit messages:");
    commits.slice(0, 12).forEach((c) => {
      const msg = (c.message || "").split("\n")[0].slice(0, 120);
      lines.push(`- ${msg}`);
    });
    lines.push("");
  }

  const topFiles = Array.isArray(diff.topFiles) ? diff.topFiles : [];
  if (topFiles.length > 0) {
    lines.push("Key files changed:");
    topFiles.slice(0, 20).forEach((f) => {
      lines.push(`- ${f.filename} (+${f.additions ?? 0} / -${f.deletions ?? 0})`);
    });
    lines.push("");
  }

  let patch = diff.patch || "";
  if (patch.length > MAX_CONTEXT_CHARS) {
    patch = patch.slice(0, MAX_CONTEXT_CHARS) + "\n... (truncated for token budget)";
  }
  if (patch) {
    lines.push("Diff excerpt:");
    lines.push("```diff");
    lines.push(patch);
    lines.push("```");
  } else {
    lines.push("No diff patch available.");
  }

  return lines.join("\n");
}

const SYSTEM_STYLE = `You are a senior software engineer performing a thorough code review of a GitHub fork.
Produce a high-quality, structured analysis in clean Markdown.

Structure your response exactly like this:

## Purpose
One paragraph describing the apparent goal of the fork.

## Key Changes
- Bullet list of the most important functional or architectural changes (max 8)

## Notable Files & Directories
- List the most impactful files/directories touched and what they likely do

## Commit Themes
- Summarize the intent across commits

## Potential Value / Impact
- Brief assessment of what users or the ecosystem gain from this fork

Keep language professional, specific, and evidence-based. Cite concrete file names or commit messages when possible. Avoid speculation.`;

export async function generateDeepForkSummary(
  forkData: DeepSummaryForkFields,
  diffData: DeepSummaryDiffFields,
  commitList: CommitMetadata[]
): Promise<string> {
  const apiKey = getGeminiApiKey();
  const context = buildContext(forkData, diffData, commitList);

  const fullPrompt = `${SYSTEM_STYLE}\n\n${context}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        parts: [{ text: fullPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      topP: 0.9,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${text || res.statusText}`);
  }

  const json: GeminiResponse = await res.json();

  if (json.error) {
    throw new Error(`Gemini error: ${json.error.message || "unknown"}`);
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return text;
}
