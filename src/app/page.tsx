import type { Metadata } from "next";
import { Suspense } from "react";
import { HomePageClient } from "@/app/_components/HomePageClient";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  getSiteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Scan a repository",
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: getSiteUrl(),
  },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: getSiteUrl(),
  },
};

export default function HomePage() {
  return (
    <Suspense fallback={<div className="text-[#8b949e] py-8">Loading…</div>}>
      <HomePageClient />
    </Suspense>
  );
}
