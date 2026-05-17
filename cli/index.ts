#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" });

import { Command } from "commander";
import { getDb } from "@/lib/db";
import { runScanPipeline } from "@/lib/workers/pipeline";

const program = new Command();

program.name("github-forks").description("GitHub Fork Intelligence CLI");

program
  .command("scan <repo>")
  .description("Start a fork scan (format: owner/repo)")
  .option("--keywords <keywords>", "Comma-separated keywords to search")
  .action(async (repo, options) => {
    try {
      const [owner, repoName] = repo.split("/");
      if (!owner || !repoName) {
        console.error("Invalid repo format. Use: owner/repo");
        process.exit(1);
      }

      console.log(`Starting scan: ${owner}/${repoName}`);

      const pb = await getDb();
      const { randomUUID } = await import("crypto");
      const scanId = randomUUID();

      await pb.collection("scans").create({
        id: scanId,
        owner,
        repo: repoName,
        status: "pending",
        keywords: options.keywords ? JSON.stringify(options.keywords.split(",")) : null,
      });

      await runScanPipeline(scanId, {
        owner,
        repo: repoName,
        keywords: options.keywords?.split(","),
      });

      console.log("✅ Scan completed!");
      console.log(`Scan ID: ${scanId}`);
    } catch (error) {
      console.error("❌ Scan failed:", error);
      process.exit(1);
    }
  });

program
  .command("query <scanId>")
  .description("Query scan results")
  .option("--limit <count>", "Number of results", "10")
  .action(async (scanId, options) => {
    try {
      const pb = await getDb();
      const forks = await pb.collection("forks").getList(1, parseInt(options.limit), {
        filter: `scanId = "${scanId}"`,
        sort: "-score",
      });

      if (forks.items.length === 0) {
        console.log("No results found.");
        return;
      }

      console.log("\n Top Forks:\n");
      forks.items.forEach((fork: any, idx: number) => {
        console.log(
          `${idx + 1}. ${fork.owner}/${fork.repo} (${fork.score?.toFixed(2)})`
        );
        console.log(`   ${fork.summary}`);
        console.log(`   Ahead: ${fork.aheadBy}, Files: ${fork.filesChanged}\n`);
      });
    } catch (error) {
      console.error("❌ Query failed:", error);
      process.exit(1);
    }
  });

program
  .command("export <scanId>")
  .description("Export scan results")
  .option("--format <format>", "Output format (json|csv)", "json")
  .action(async (scanId, options) => {
    try {
      const pb = await getDb();
      const forks = await pb.collection("forks").getFullList({
        filter: `scanId = "${scanId}"`,
        sort: "-score",
      });

      if (options.format === "json") {
        console.log(JSON.stringify(forks, null, 2));
      } else if (options.format === "csv") {
        console.log(
          "owner,repo,stars,ahead_by,files_changed,score,summary"
        );
        forks.forEach((fork: any) => {
          console.log(
            `${fork.owner},${fork.repo},${fork.stars},${fork.aheadBy},${fork.filesChanged},${fork.score},"${fork.summary}"`
          );
        });
      }
    } catch (error) {
      console.error("❌ Export failed:", error);
      process.exit(1);
    }
  });

program.parse();
