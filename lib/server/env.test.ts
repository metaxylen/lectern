import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";
import { DEFAULT_WHISPER_PORT, defaultWhisperBinPath, defaultWhisperModelPath } from "./stt/paths";

describe("parseEnv", () => {
  it("applies defaults when nothing is set", () => {
    expect(parseEnv({})).toEqual({
      OLLAMA_HOST: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_API_KEY: "",
      OPENAI_MODEL: "gpt-4o-mini",
      LECTERN_GEMINI_ENABLED: true,
      GEMINI_API_KEY: "",
      GEMINI_MODEL: "gemini-flash-latest",
      NOTES_MAX_TRANSCRIPT_CHARS: 500_000,
      NOTES_RATE_LIMIT_PER_MINUTE: 20,
      WHISPER_MODEL_PATH: defaultWhisperModelPath(),
      WHISPER_SERVER_BIN: defaultWhisperBinPath(),
      WHISPER_SERVER_URL: "",
      WHISPER_PORT: DEFAULT_WHISPER_PORT,
      STT_MAX_AUDIO_BYTES: 8_000_000,
      STT_RATE_LIMIT_PER_MINUTE: 90,
      WHISPER_IDLE_SHUTDOWN_MS: 300_000,
    });
  });

  it("treats empty strings as unset", () => {
    const env = parseEnv({ OLLAMA_HOST: "", GEMINI_MODEL: "  ", NOTES_RATE_LIMIT_PER_MINUTE: "" });
    expect(env.OLLAMA_HOST).toBe("http://127.0.0.1:11434");
    expect(env.GEMINI_MODEL).toBe("gemini-flash-latest");
    expect(env.NOTES_RATE_LIMIT_PER_MINUTE).toBe(20);
  });

  it("parses the Gemini app toggle without changing the system key", () => {
    expect(
      parseEnv({ GEMINI_API_KEY: "system-key", LECTERN_GEMINI_ENABLED: "false" }),
    ).toMatchObject({
      GEMINI_API_KEY: "system-key",
      LECTERN_GEMINI_ENABLED: false,
    });
    expect(parseEnv({ LECTERN_GEMINI_ENABLED: "1" }).LECTERN_GEMINI_ENABLED).toBe(true);
  });

  it("strips trailing slashes and trims values", () => {
    const env = parseEnv({
      OLLAMA_HOST: "http://ollama:11434//",
      OPENAI_BASE_URL: "https://llm.example/v1///",
      GEMINI_API_KEY: " key ",
    });
    expect(env.OLLAMA_HOST).toBe("http://ollama:11434");
    expect(env.OPENAI_BASE_URL).toBe("https://llm.example/v1");
    expect(env.GEMINI_API_KEY).toBe("key");
  });

  it("coerces numbers and allows 0 to disable rate limiting", () => {
    expect(parseEnv({ NOTES_RATE_LIMIT_PER_MINUTE: "0" }).NOTES_RATE_LIMIT_PER_MINUTE).toBe(0);
    expect(parseEnv({ NOTES_MAX_TRANSCRIPT_CHARS: "1000" }).NOTES_MAX_TRANSCRIPT_CHARS).toBe(1000);
    expect(parseEnv({ STT_RATE_LIMIT_PER_MINUTE: "0" }).STT_RATE_LIMIT_PER_MINUTE).toBe(0);
    expect(parseEnv({ WHISPER_PORT: "9001" }).WHISPER_PORT).toBe(9001);
  });

  it("throws one readable error listing every problem", () => {
    expect(() => parseEnv({ OLLAMA_HOST: "not a url", NOTES_MAX_TRANSCRIPT_CHARS: "-5" })).toThrow(
      /Invalid environment configuration[\s\S]*OLLAMA_HOST[\s\S]*NOTES_MAX_TRANSCRIPT_CHARS/,
    );
  });

  it("accepts a whisper server URL and strips a trailing slash", () => {
    expect(parseEnv({ WHISPER_SERVER_URL: "http://127.0.0.1:8178/" }).WHISPER_SERVER_URL).toBe(
      "http://127.0.0.1:8178",
    );
  });
});
