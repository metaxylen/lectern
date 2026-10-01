import { getEnv } from "../env";
import { whisperInstall } from "./paths";
import { isSidecarLive } from "./server";
import type { WhisperEngineStatus } from "../../types";

/** Disk + sidecar probe. Does not start the server (status must stay cheap). */
export function getWhisperStatus(): WhisperEngineStatus {
  const env = getEnv();
  const install = whisperInstall({
    modelPath: env.WHISPER_MODEL_PATH,
    binPath: env.WHISPER_SERVER_BIN,
    serverUrl: env.WHISPER_SERVER_URL,
  });
  return {
    available: install.available,
    ready: isSidecarLive(),
    model: install.available ? "large-v3-turbo" : null,
    binary: install.binary,
    backend: process.platform === "darwin" ? "metal" : "cpu",
  };
}
