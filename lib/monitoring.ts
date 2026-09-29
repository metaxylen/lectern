/**
 * Vendor-neutral error reporting. Every reported error is logged as one structured line; if
 * NEXT_PUBLIC_ERROR_REPORT_URL is set it is also POSTed there as JSON (works with any collector,
 * a serverless function, or a thin adapter in front of Sentry/Datadog). Swap the body of
 * `deliver` to plug in a vendor SDK; call sites do not change.
 */

export type ErrorContext = Record<string, unknown>;

export type ErrorReport = {
  message: string;
  name: string;
  stack?: string;
  digest?: string;
  context: ErrorContext;
  runtime: "browser" | "server";
  url?: string;
  timestamp: string;
};

const MAX_REPORTS_PER_SESSION = 25;
let sent = 0;
const seen = new Set<string>();

export function toErrorReport(error: unknown, context: ErrorContext = {}): ErrorReport {
  const err =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest: unknown }).digest)
      : undefined;
  const isBrowser = typeof window !== "undefined";
  return {
    message: err.message,
    name: err.name,
    stack: err.stack,
    digest,
    context,
    runtime: isBrowser ? "browser" : "server",
    url: isBrowser ? window.location.href : undefined,
    timestamp: new Date().toISOString(),
  };
}

async function deliver(report: ErrorReport) {
  const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORT_URL;
  if (!endpoint) return;
  const body = JSON.stringify(report);
  try {
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    } else {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {
    // Reporting must never throw.
  }
}

export function reportError(error: unknown, context: ErrorContext = {}) {
  const report = toErrorReport(error, context);
  console.error(`[error] ${report.name}: ${report.message}`, report.context);

  // De-duplicate and cap so an error loop cannot flood the collector.
  const fingerprint = `${report.name}:${report.message}:${report.stack?.split("\n")[1] ?? ""}`;
  if (seen.has(fingerprint) || sent >= MAX_REPORTS_PER_SESSION) return;
  seen.add(fingerprint);
  sent += 1;
  void deliver(report);
}
