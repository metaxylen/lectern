import { describe, expect, it, vi } from "vitest";
import { reportError, toErrorReport } from "./monitoring";

describe("toErrorReport", () => {
  it("captures error details and digest", () => {
    const err = Object.assign(new Error("boom"), { digest: "abc123" });
    const r = toErrorReport(err, { route: "/x" });
    expect(r).toMatchObject({
      message: "boom",
      name: "Error",
      digest: "abc123",
      runtime: "server",
    });
    expect(r.context).toEqual({ route: "/x" });
    expect(new Date(r.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("wraps non-Error values", () => {
    expect(toErrorReport("plain string").message).toBe("plain string");
    expect(toErrorReport({ weird: true }).message).toBe("Unknown error");
  });
});

describe("reportError", () => {
  it("logs and posts to the configured endpoint once per unique error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORT_URL", "https://collector.test/e");
    const fetchMock = vi.fn((_url: string) => Promise.resolve(new Response("ok")));
    vi.stubGlobal("fetch", fetchMock);

    const err = new Error("dedupe-me");
    reportError(err);
    reportError(err);
    await Promise.resolve();
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://collector.test/e");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("never throws even if delivery fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORT_URL", "https://collector.test/e");
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));
    expect(() => reportError(new Error("unique-failure"))).not.toThrow();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});
