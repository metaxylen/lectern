import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "engine_failed"
  | "misconfigured";

/** Uniform error body: `{ error: <human message>, code: <stable machine code> }`. */
export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: Record<string, string>,
) {
  return NextResponse.json({ error: message, code }, { status, headers });
}
