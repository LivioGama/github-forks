import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// /var/task is read-only on Vercel — only os.tmpdir() is writable there.
const CACHE_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), 'github-forks-cache')
  : path.join(__dirname, '../../../.cache/github');

let cacheDirReady = false;

// Lazily ensure the cache directory — no fs side effects at module eval,
// which crashes serverless cold starts before the route can respond.
function ensureCacheDir(): void {
  if (cacheDirReady) return;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  cacheDirReady = true;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

function getCacheKey(endpoint: string, params: Record<string, unknown>): string {
  const key = `${endpoint}:${JSON.stringify(params)}`;
  return Buffer.from(key).toString('base64').replace(/[+/=]/g, '').substring(0, 64);
}

function getCachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

export async function get<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T | null> {
  const key = getCacheKey(endpoint, params);
  const cachePath = getCachePath(key);

  try {
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const content = fs.readFileSync(cachePath, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);
    const now = Date.now();

    if (now - entry.timestamp > entry.ttl) {
      // Cache expired
      fs.unlinkSync(cachePath);
      return null;
    }

    return entry.data as T;
  } catch (error) {
    // If cache read fails, ignore and return null
    return null;
  }
}

export async function set<T>(endpoint: string, data: T, params: Record<string, unknown> = {}, ttl: number = 3600000): Promise<void> {
  const key = getCacheKey(endpoint, params);
  const cachePath = getCachePath(key);

  const entry: CacheEntry = {
    data,
    timestamp: Date.now(),
    ttl,
  };

  try {
    ensureCacheDir();
    fs.writeFileSync(cachePath, JSON.stringify(entry), 'utf-8');
  } catch (error) {
    // If cache write fails, ignore
    console.error('Failed to write cache:', error);
  }
}

export function clear(): void {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true, force: true });
      cacheDirReady = false;
    }
    ensureCacheDir();
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}
