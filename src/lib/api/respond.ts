import { NextResponse } from "next/server";
import { errorMessage } from "@/lib/errors";

export function respondWithError(error: unknown, status = 500): NextResponse {
  return NextResponse.json({ error: errorMessage(error) }, { status });
}
