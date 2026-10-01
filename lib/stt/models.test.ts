import { describe, expect, it } from "vitest";
import {
  MODEL_NATIVE,
  NATIVE_WHISPER_ID,
  WHISPER_MODEL_IDS,
  isNativeWhisper,
  shortModelName,
} from "./models";

describe("whisper model ids", () => {
  it("treats whisper.cpp models as native and omits them from the browser cache list", () => {
    expect(isNativeWhisper(NATIVE_WHISPER_ID)).toBe(true);
    expect(isNativeWhisper("onnx-community/whisper-small")).toBe(false);
    expect(WHISPER_MODEL_IDS).not.toContain(MODEL_NATIVE);
    expect(WHISPER_MODEL_IDS).toContain("onnx-community/whisper-tiny");
  });

  it("shortens ids to the last path segment", () => {
    expect(shortModelName(NATIVE_WHISPER_ID)).toBe("large-v3-turbo");
    expect(shortModelName("onnx-community/whisper-small")).toBe("whisper-small");
  });
});
