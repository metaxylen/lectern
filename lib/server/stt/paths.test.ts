import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { whisperInstall } from "./paths";

describe("whisperInstall", () => {
  it("is available only when both the binary and the model exist", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "lectern-whisper-"));
    const modelPath = path.join(dir, "model.bin");
    const binPath = path.join(dir, "whisper-server");
    expect(whisperInstall({ modelPath, binPath, serverUrl: "" })).toEqual({
      model: false,
      binary: false,
      available: false,
    });
    writeFileSync(modelPath, "x");
    expect(whisperInstall({ modelPath, binPath, serverUrl: "" }).available).toBe(false);
    writeFileSync(binPath, "x");
    expect(whisperInstall({ modelPath, binPath, serverUrl: "" })).toEqual({
      model: true,
      binary: true,
      available: true,
    });
  });

  it("treats a configured server URL as already installed", () => {
    expect(
      whisperInstall({
        modelPath: "/missing.bin",
        binPath: "/missing",
        serverUrl: "http://127.0.0.1:8178",
      }),
    ).toEqual({ model: true, binary: true, available: true });
  });
});
