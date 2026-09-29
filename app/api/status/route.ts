import { NextResponse } from "next/server";
import { reportError } from "@/lib/monitoring";
import { apiError } from "@/lib/server/api";
import { getEngineStatus } from "@/lib/server/notes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getEngineStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    reportError(err, { route: "/api/status" });
    return apiError(
      500,
      "misconfigured",
      "The server is misconfigured. Check its environment variables.",
    );
  }
}
