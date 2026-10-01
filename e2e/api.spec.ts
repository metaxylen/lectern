import { expect, test } from "@playwright/test";

test("GET /api/health", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

test("GET /api/status reports engines", async ({ request }) => {
  const body = await (await request.get("/api/status")).json();
  expect(body.ollama.reachable).toBe(false);
  expect(body.gemini.configured).toBe(false);
  expect(typeof body.whisper.available).toBe("boolean");
  expect(body.whisper).toHaveProperty("model");
});

test("POST /api/notes validates input", async ({ request }) => {
  const res = await request.post("/api/notes", { data: { transcript: "" } });
  expect(res.status()).toBe(400);
  expect(await res.json()).toMatchObject({ code: "invalid_request" });

  const bad = await request.post("/api/notes", {
    data: Buffer.from("{oops"),
    headers: { "content-type": "application/json" },
  });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toMatchObject({ code: "invalid_json" });
});

test("POST /api/notes returns offline notes", async ({ request }) => {
  const res = await request.post("/api/notes", {
    data: {
      transcript:
        "A thread is a unit of execution. This is important for the exam. Processes do not share memory by default.",
      engine: "offline",
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.engine).toBe("offline");
  expect(body.notes.keyPoints.length).toBeGreaterThan(0);
});
