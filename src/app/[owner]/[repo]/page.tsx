import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ScanResults } from "@/app/_components/ScanResults";
import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";
import { SITE_NAME, SITE_OG_DESCRIPTION, getSiteUrl } from "@/lib/site";

// Canonical URL for a completed scan: /<owner>/<repo>.
// Server component — looks up the most recent completed scan for this
// owner/repo combo and renders the shared results UI inline. If no
// completed scan exists yet, sends the visitor back to the home page
// with the repo prefilled so they can start one.

export const dynamic = "force-dynamic";

interface RepoPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

async function findLatestCompletedScanId(
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const db = await getDb();
    const result = await db.collection("scans").getList(1, 1, {
      ...PB_NO_CANCEL,
      filter: `owner = "${owner}" && repo = "${repo}" && status = "completed"`,
      sort: "-startedAt",
    });
    return result.items[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: RepoPageProps): Promise<Metadata> {
  const { owner, repo } = await params;
  const canonicalPath = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const canonical = `${getSiteUrl()}${canonicalPath}`;
  const title = `${owner}/${repo}`;
  const description = `Fork analysis for ${owner}/${repo} — ranked forks, real changes only, ask the diffs questions in plain English.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description: SITE_OG_DESCRIPTION,
      url: canonical,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { owner, repo } = await params;
  const scanId = await findLatestCompletedScanId(owner, repo);

  if (!scanId) {
    redirect(`/?repo=${encodeURIComponent(`${owner}/${repo}`)}`);
  }

  return <ScanResults key={scanId} scanId={scanId} />;
}
