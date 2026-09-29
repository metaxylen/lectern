import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe for load balancers and uptime monitors. Does no external I/O. */
export function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
