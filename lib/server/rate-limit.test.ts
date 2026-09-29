import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit then blocks with a retry hint", () => {
    let now = 1_000;
    const rl = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });
    expect(rl.check("a")).toMatchObject({ ok: true, remaining: 1 });
    expect(rl.check("a")).toMatchObject({ ok: true, remaining: 0 });
    now += 10_000;
    const blocked = rl.check("a");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(50);
  });

  it("recovers after the window and isolates keys", () => {
    let now = 0;
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
    expect(rl.check("b").ok).toBe(true);
    now = 1001;
    expect(rl.check("a").ok).toBe(true);
  });

  it("is disabled when limit is 0", () => {
    const rl = createRateLimiter({ limit: 0, windowMs: 1000 });
    for (let i = 0; i < 100; i++) expect(rl.check("a").ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the first x-forwarded-for entry", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });
  it("falls back to x-real-ip then a shared bucket", () => {
    expect(clientKey(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientKey(new Headers())).toBe("local");
  });
});
