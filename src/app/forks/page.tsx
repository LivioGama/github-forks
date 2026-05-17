import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { PB_NO_CANCEL } from "@/lib/db/pocketbase-query";

// Legacy back-compat route. The canonical URL for a completed scan is now
// /<owner>/<repo>. Old links like /forks?scanId=… still arrive here —
// look up the scan and 308 the visitor to the canonical URL.

export const dynamic = "force-dynamic";

export default async function ForksPage({
  searchParams,
}: {
  searchParams: Promise<{ scanId?: string }>;
}) {
  const { scanId } = await searchParams;

  if (!scanId) redirect("/");

  try {
    const db = await getDb();
    const scan = (await db.collection("scans").getOne(scanId, PB_NO_CANCEL)) as {
      owner: string;
      repo: string;
    };
    redirect(`/${encodeURIComponent(scan.owner)}/${encodeURIComponent(scan.repo)}`);
  } catch (error: unknown) {
    // `redirect()` throws an internal NEXT_REDIRECT — let it propagate.
    if (
      error instanceof Error &&
      (error as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    redirect("/");
  }
}
