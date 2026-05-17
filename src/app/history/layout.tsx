import type { Metadata } from "next";
import { SITE_NAME, getSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Recent scans",
  description: `Repositories you recently analyzed with ${SITE_NAME}. Jump back to full fork rankings and Ask results.`,
  alternates: {
    canonical: `${getSiteUrl()}/history`,
  },
  openGraph: {
    title: `Recent scans | ${SITE_NAME}`,
    description: `Quick links to repositories you scanned recently.`,
    url: `${getSiteUrl()}/history`,
  },
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
