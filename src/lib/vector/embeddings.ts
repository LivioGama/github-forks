import { OpenAI } from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 25;
const EMBEDDING_MAX_CHARS = 30000;
const CHUNK_BOUNDARY_MIN_CHARS = 100;
const CHUNK_MAX_CHARS = 2000;
const CHUNK_FINAL_MIN_CHARS = 50;
const CHUNK_TOP_N = 10;
const CHUNK_TRUNCATE_CHARS = 5000;

let openai: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openai) return openai;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  openai = new OpenAI({ apiKey });
  return openai;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const client = getOpenAIClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({ input: batch, model: EMBEDDING_MODEL });

    const ordered = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of ordered) embeddings.push(item.embedding);
  }

  return embeddings;
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

export function truncateForEmbedding(text: string, maxChars = EMBEDDING_MAX_CHARS): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n... (truncated)";
}

export function extractDiffChunks(patch: string, commitMessages: string[]): string[] {
  const chunks: string[] = [];

  for (const msg of commitMessages) {
    const cleaned = msg.trim();
    if (cleaned.length > 0) chunks.push(cleaned);
  }

  const buffer: string[] = [];
  let bufferLength = 0;

  const flush = () => {
    const text = buffer.join("").trim();
    if (text.length > CHUNK_BOUNDARY_MIN_CHARS) chunks.push(text);
    buffer.length = 0;
    bufferLength = 0;
  };

  const push = (line: string) => {
    buffer.push(line);
    bufferLength += line.length;
    if (bufferLength > CHUNK_MAX_CHARS) flush();
  };

  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git")) {
      flush();
      push(line + "\n");
    } else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
      push(line + "\n");
    } else if (line.startsWith("+") || line.startsWith("-")) {
      push(line.substring(1) + "\n");
    }
  }
  flush();

  return chunks
    .filter((chunk) => chunk.length > CHUNK_FINAL_MIN_CHARS)
    .slice(0, CHUNK_TOP_N)
    .map((chunk) => truncateForEmbedding(chunk, CHUNK_TRUNCATE_CHARS));
}
