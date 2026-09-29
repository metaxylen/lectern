import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("applies defaults when nothing is set", () => {
    expect(parseEnv({})).toEqual({
      OLLAMA_HOST: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "",
      GEMINI_API_KEY: "",
      GEMINI_MODEL: "gemini-flash-latest",
      NOTES_MAX_TRANSCRIPT_CHARS: 500_000,
      NOTES_RATE_LIMIT_PER_MINUTE: 20,
    });
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ OLLAMA_HOST: "", GEMINI_MODEL: "  ", NOTES_RATE_LIMIT_PER_MINUTE: "" });
    expect(env.OLLAMA_HOST).toBe("http://127.0.0.1:11434");
    expect(env.GEMINI_MODEL).toBe("gemini-flash-latest");
    expect(env.NOTES_RATE_LIMIT_PER_MINUTE).toBe(20);
  });

  it("strips trailing slashes and trims values", () => {
    const env = parseEnv({ OLLAMA_HOST: "http://ollama:11434//", GEMINI_API_KEY: " key " });
    expect(env.OLLAMA_HOST).toBe("http://ollama:11434");
    expect(env.GEMINI_API_KEY).toBe("key");
  });

  it("coerces numbers and allows 0 to disable rate limiting", () => {
    expect(parseEnv({ NOTES_RATE_LIMIT_PER_MINUTE: "0" }).NOTES_RATE_LIMIT_PER_MINUTE).toBe(0);
    expect(parseEnv({ NOTES_MAX_TRANSCRIPT_CHARS: "1000" }).NOTES_MAX_TRANSCRIPT_CHARS).toBe(1000);
  });

  it("throws one readable error listing every problem", () => {
    expect(() => parseEnv({ OLLAMA_HOST: "not a url", NOTES_MAX_TRANSCRIPT_CHARS: "-5" })).toThrow(
      /Invalid environment configuration[\s\S]*OLLAMA_HOST[\s\S]*NOTES_MAX_TRANSCRIPT_CHARS/,
    );
  });
});
