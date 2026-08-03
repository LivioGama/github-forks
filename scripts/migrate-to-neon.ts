/**
 * One‑off migration from the local PocketBase SQLite file (`data/forks.db`)
 * to a Neon PostgreSQL database.
 *
 * Usage (after setting env vars):
 *   bun run scripts/migrate-to-neon.ts
 *
 * Required env vars:
 *   POSTGRES_URL – Neon connection string (e.g. `postgresql://user:pass@host/db`)
 *   SQLITE_PATH  – Path to the SQLite file (defaults to `data/forks.db`)
 */

import { Database as SqliteDb } from "bun:sqlite";
import { Pool } from "pg";

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error("POSTGRES_URL env var is required");
  process.exit(1);
}

const SQLITE_PATH = process.env.SQLITE_PATH || "data/forks.db";

function openSqlite(path: string): SqliteDb {
  return new SqliteDb(path, { readonly: true });
}

function dumpTable(db: SqliteDb, table: string): any[] {
  return db.query(`SELECT * FROM ${table}`).all();
}

async function main() {
  const sqlite = openSqlite(SQLITE_PATH);
  const pg = new Pool({ connectionString: POSTGRES_URL });

  // Ensure tables exist – schema mirrors PocketBase collections (camelCase
  // columns so the PostgresDB adapter and the app's field names line up).
  const creates = [
    `CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      status TEXT NOT NULL,
      "startedAt" TEXT,
      "finishedAt" TEXT,
      "totalForks" INTEGER,
      "processedForks" INTEGER,
      keywords TEXT,
      error TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS forks (
      id TEXT PRIMARY KEY,
      "scanId" TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      "fullName" TEXT,
      stars INTEGER,
      "defaultBranch" TEXT,
      "updatedAt" TEXT,
      "aheadBy" INTEGER,
      "filesChanged" INTEGER,
      "linesAdded" INTEGER,
      "linesRemoved" INTEGER,
      score REAL,
      summary TEXT,
      "deepSummary" TEXT,
      "deepSummaryGeneratedAt" TEXT,
      "topFiles" TEXT,
      "commitsJson" TEXT,
      "semanticScore" REAL,
      untouched BOOLEAN,
      stage TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS diffs (
      id TEXT PRIMARY KEY,
      "forkId" TEXT NOT NULL,
      patch TEXT,
      "topFiles" TEXT,
      "commitsCount" INTEGER,
      status TEXT,
      error TEXT,
      "createdAt" TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      "scanId" TEXT NOT NULL,
      type TEXT,
      status TEXT,
      progress INTEGER,
      total INTEGER,
      processed INTEGER,
      error TEXT,
      "startedAt" TEXT,
      "completedAt" TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      "forkId" TEXT NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      "qdrantId" INTEGER,
      "createdAt" TEXT
    );`,
  ];

  for (const stmt of creates) await pg.query(stmt);

  const tables = ["scans", "forks", "diffs", "jobs", "chunks"];
  // Map snake_case SQLite columns to camelCase Postgres columns.
  const columnMap: Record<string, Record<string, string>> = {
    scans: {
      started_at: "startedAt",
      finished_at: "finishedAt",
      total_forks: "totalForks",
      processed_forks: "processedForks",
    },
    forks: {
      scan_id: "scanId",
      full_name: "fullName",
      default_branch: "defaultBranch",
      updated_at: "updatedAt",
      ahead_by: "aheadBy",
      files_changed: "filesChanged",
      lines_added: "linesAdded",
      lines_removed: "linesRemoved",
      top_files: "topFiles",
      commits_json: "commitsJson",
      semantic_score: "semanticScore",
    },
    diffs: {
      fork_id: "forkId",
      top_files: "topFiles",
      commits_count: "commitsCount",
      created_at: "createdAt",
    },
    jobs: {
      scan_id: "scanId",
      started_at: "startedAt",
      completed_at: "completedAt",
    },
    chunks: {
      fork_id: "forkId",
      qdrant_id: "qdrantId",
      created_at: "createdAt",
    },
  };

  for (const tbl of tables) {
    // Some sources (e.g. the PocketBase instance on the exodus host) don't
    // have the chunks/jobs tables; skip them instead of failing the migration.
    const exists = sqlite
      .query(`SELECT name FROM sqlite_master WHERE type='table' AND name=?1`)
      .get(tbl);
    if (!exists) {
      console.log(`Skipping ${tbl} (table not present in source).`);
      continue;
    }
    const rows = dumpTable(sqlite, tbl);
    console.log(`Migrating ${rows.length} rows from ${tbl}...`);
    for (const row of rows) {
      const mapped: Record<string, any> = {};
      for (const [col, value] of Object.entries(row)) {
        const target = columnMap[tbl]?.[col] ?? col;
        let v =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : value;
        // Normalize timestamps to ISO strings (matching how the app writes
        // new Date().toISOString() / new Date(...) at runtime). SQLite stores
        // two shapes: datetime strings ("2026-05-12 00:08:14") and epoch
        // seconds (forks.updated_at).
        if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}[ T]/.test(v)) {
          const ms = new Date(v.replace(" ", "T")).getTime();
          if (!Number.isNaN(ms)) v = new Date(ms).toISOString();
        } else if (typeof v === "number" && v > 1e9 && v < 1e12) {
          v = new Date(v * 1000).toISOString();
        }
        mapped[target] = v;
      }
      const cols = Object.keys(mapped);
      const vals = Object.values(mapped);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const quotedCols = cols.map((c) => `"${c}"`).join(", ");
      const sql = `INSERT INTO "${tbl}" (${quotedCols}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`;
      await pg.query(sql, vals);
    }
  }

  await pg.end();
  console.log("Migration complete.");
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
