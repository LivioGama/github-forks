import { getOpenAIClient } from "@/lib/vector/embeddings";

// Per-fork trait classifier. Given a fork and a natural-language question
// ("does this fork implement X?"), call an LLM with the fork's diff/commit
// context and get back a structured yes/no + reasoning.
//
// This replaces aggregate semantic similarity (Qdrant + cosine ranking) for
// the trait-targeting use case: instead of fuzzy-ranking all 50 forks, ask
// the same focused question of each one and collect the hits. The loop is
// embarrassingly parallel and the fork set is bounded, so this is fine.

const CLASSIFIER_MODEL = "gpt-4o-mini";

// Token budget per fork — keep prompts small so we can parallelise generously
// and stay cheap across all forks in a scan (~50 cap).
const MAX_PATCH_CHARS = 4000;
const MAX_COMMIT_MESSAGES = 8;
const MAX_COMMIT_MESSAGE_CHARS = 200;
const MAX_TOP_FILES = 15;

export interface ClassifierFork {
  owner: string;
  repo: string;
  summary: string;
  aheadBy: number;
  filesChanged: number;
  topFileNames: string[];
  commitMessages: string[];
  patch: string;
}

export interface ClassifierResult {
  matches: boolean;
  reasoning: string;
}

const SYSTEM_PROMPT = `You analyze GitHub fork diffs to determine whether a fork implements a specific trait, feature, or change described by the user.

You will be given:
- A question about a single fork ("does this fork ...?").
- The fork's metadata and a diff excerpt.

Respond with a JSON object exactly matching this shape:
{ "matches": boolean, "reasoning": "one short sentence (max ~25 words) citing concrete evidence from the diff/commits/files, or saying why nothing matches" }

Be strict. "matches" should be true only if there is direct evidence in the diff, file paths, or commit messages. Speculation about what the fork *might* do based on the repo name alone is not evidence. If the diff is empty or doesn't touch anything relevant, answer false.`;

function buildUserPrompt(question: string, fork: ClassifierFork): string {
  const commitLines = fork.commitMessages
    .slice(0, MAX_COMMIT_MESSAGES)
    .map((message) => {
      const firstLine = message.split("\n")[0]?.trim() ?? "";
      return `  - ${firstLine.slice(0, MAX_COMMIT_MESSAGE_CHARS)}`;
    })
    .join("\n");

  const fileLines = fork.topFileNames
    .slice(0, MAX_TOP_FILES)
    .map((filename) => `  - ${filename}`)
    .join("\n");

  const patchExcerpt =
    fork.patch.length > MAX_PATCH_CHARS
      ? fork.patch.slice(0, MAX_PATCH_CHARS) + "\n... (truncated)"
      : fork.patch;

  return [
    `Question: ${question}`,
    "",
    `Fork: ${fork.owner}/${fork.repo}`,
    `Summary: ${fork.summary || "(none)"}`,
    `Ahead: ${fork.aheadBy} commits, ${fork.filesChanged} files changed`,
    "",
    `Files changed:\n${fileLines || "  (none)"}`,
    "",
    `Commit messages:\n${commitLines || "  (none)"}`,
    "",
    "Diff excerpt:",
    "```diff",
    patchExcerpt || "(empty)",
    "```",
  ].join("\n");
}

export async function classifyFork(
  question: string,
  fork: ClassifierFork
): Promise<ClassifierResult> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: CLASSIFIER_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(question, fork) },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: { matches?: unknown; reasoning?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { matches: false, reasoning: "Classifier returned invalid JSON." };
  }

  const matches = parsed.matches === true;
  const reasoning =
    typeof parsed.reasoning === "string" && parsed.reasoning.trim().length > 0
      ? parsed.reasoning.trim()
      : matches
        ? "Match"
        : "No match";

  return { matches, reasoning };
}
