/**
 * Idempotently adds optional `forks` fields used by this app if they are missing.
 * Same logic as runtime auto-migration in `ensureForksGeminiFields` — run this from
 * CI/SSH when you prefer an explicit migration step.
 *
 *   bun run pb:add-fork-gemini-fields
 *
 * Requires POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
 * (see `.env`, `.env.production`, `.env.local`).
 */

import PocketBase from "pocketbase";
import { config } from "dotenv";
import { ensureForksGeminiFields } from "../src/lib/db/ensure-forks-gemini-fields";

// Later files must win so local / remote URL overrides docker-internal production defaults.
config({ path: ".env" });
config({ path: ".env.production", override: true });
config({ path: ".env.local", override: true });

async function main() {
  const url = process.env.POCKETBASE_URL || "http://localhost:8090";
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD");
    process.exit(1);
  }

  const pb = new PocketBase(url);
  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch {
    await (pb as any).admins.authWithPassword(email, password);
  }
  console.log("✓ Authenticated");

  const updated = await ensureForksGeminiFields(pb);
  if (updated) {
    console.log("✓ Added missing fields on `forks` (deepSummary, deepSummaryGeneratedAt, and/or commitsJson).");
  } else {
    console.log("✓ All optional fields already present — nothing to do.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
