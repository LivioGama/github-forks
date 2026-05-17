/** Canonical public URL for SEO (metadataBase, sitemap, robots, JSON-LD). */
const DEFAULT_SITE_URL = "https://forks-github.devliv.io";

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return DEFAULT_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_NAME = "GitHub Fork Intelligence";
export const SITE_TAGLINE = "Find Meaningful Forks";
export const SITE_DESCRIPTION =
  "Analyze every fork of any GitHub repository, surface the ones with real changes, and ask natural-language questions to find forks that implement a specific feature.";

export const SITE_OG_DESCRIPTION =
  "Scan all forks of any GitHub repo. Drop the noise, surface real changes, and ask the diffs questions in plain English.";

export const SITE_TWITTER_DESCRIPTION =
  "Scan every fork, drop the noise, ask the diffs questions in plain English.";
