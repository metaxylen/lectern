import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const DEFAULT_WHISPER_DIR = path.join(homedir(), ".local", "share", "lectern", "whisper");
export const DEFAULT_WHISPER_MODEL_NAME = "ggml-large-v3-turbo.bin";
export const DEFAULT_WHISPER_PORT = 8178;

export function defaultWhisperModelPath(): string {
  return path.join(DEFAULT_WHISPER_DIR, DEFAULT_WHISPER_MODEL_NAME);
}

export function defaultWhisperBinPath(): string {
  return path.join(DEFAULT_WHISPER_DIR, "bin", "whisper-server");
}

export type WhisperInstall = {
  model: boolean;
  binary: boolean;
  /** Binary and weights are on disk, or a running server was configured. */
  available: boolean;
};

export function whisperInstall(opts: {
  modelPath: string;
  binPath: string;
  serverUrl: string;
}): WhisperInstall {
  if (opts.serverUrl) return { model: true, binary: true, available: true };
  const model = existsSync(opts.modelPath);
  const binary = existsSync(opts.binPath);
  return { model, binary, available: model && binary };
}
