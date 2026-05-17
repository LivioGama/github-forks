import type { Metadata } from "next";
import { SITE_NAME, SITE_OG_DESCRIPTION, getSiteUrl } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  const canonicalPath = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const canonical = `${getSiteUrl()}${canonicalPath}`;
  const title = `${owner}/${repo}`;
  const description = `Fork diff summary for ${owner}/${repo} — commits ahead, files changed, and a preview of the patch.`;
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

export default function ForkDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
