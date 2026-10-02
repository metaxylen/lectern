import { spawn, type ChildProcess } from "node:child_process";
import { availableParallelism } from "node:os";
import path from "node:path";
import { getEnv } from "../env";
import { whisperInstall } from "./paths";

export class WhisperUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhisperUnavailableError";
  }
}

let child: ChildProcess | null = null;
let starting: Promise<string> | null = null;

export function whisperServerUrl(): string {
  const env = getEnv();
  if (env.WHISPER_SERVER_URL) return env.WHISPER_SERVER_URL;
  return `http://127.0.0.1:${env.WHISPER_PORT}`;
}

export function isSidecarLive(): boolean {
  return child !== null && child.exitCode === null;
}

export async function isWhisperServerUp(url = whisperServerUrl()): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(800) });
    return res.status > 0;
  } catch {
    return false;
  }
}

export function requireWhisperInstall() {
  const env = getEnv();
  const install = whisperInstall({
    modelPath: env.WHISPER_MODEL_PATH,
    binPath: env.WHISPER_SERVER_BIN,
    serverUrl: env.WHISPER_SERVER_URL,
  });
  if (install.available) return install;
  const missing = [
    !install.binary ? "whisper-server binary" : null,
    !install.model ? "large-v3-turbo model" : null,
  ].filter(Boolean);
  throw new WhisperUnavailableError(
    `Local Whisper (large-v3-turbo) is not installed (${missing.join(" and ")} missing). Run npm run whisper:setup.`,
  );
}

/**
 * Make sure a whisper.cpp HTTP server is listening. Reuses one sidecar process so the model
 * stays in memory between live ticks and 20-second parts.
 */
export async function ensureWhisperServer(): Promise<string> {
  cancelWhisperIdleShutdown();
  const url = whisperServerUrl();
  if (await isWhisperServerUp(url)) return url;
  if (getEnv().WHISPER_SERVER_URL) {
    throw new WhisperUnavailableError(`Whisper server at ${url} is not reachable.`);
  }
  requireWhisperInstall();
  starting ??= spawnServer(url);
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

async function spawnServer(url: string): Promise<string> {
  if (await isWhisperServerUp(url)) return url;
  const env = getEnv();
  const threads = Math.max(2, availableParallelism() - 2);
  const args = [
    "-m",
    env.WHISPER_MODEL_PATH,
    "--host",
    "127.0.0.1",
    "--port",
    String(env.WHISPER_PORT),
    "--inference-path",
    "/inference",
    "-l",
    "auto",
    "-sns",
    "-t",
    String(threads),
  ];
  const proc = spawn(env.WHISPER_SERVER_BIN, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    cwd: path.dirname(env.WHISPER_SERVER_BIN),
  });
  child = proc;
  const errChunks: string[] = [];
  proc.stderr?.on("data", (buf: Buffer) => {
    errChunks.push(String(buf));
    if (errChunks.length > 50) errChunks.shift();
  });
  proc.on("exit", () => {
    if (child === proc) child = null;
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      child = null;
      throw new WhisperUnavailableError(
        `whisper-server exited (${proc.exitCode}): ${errChunks.join("").trim().slice(-800) || "no output"}`,
      );
    }
    if (await isWhisperServerUp(url)) {
      return url;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill();
  child = null;
  throw new WhisperUnavailableError("whisper-server did not become ready in time.");
}

function killSidecar() {
  try {
    child?.kill();
  } catch {
    // already gone
  }
  child = null;
}

let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Free RAM when no transcription has run for a while (sidecar we spawned only). */
export function scheduleWhisperIdleShutdown() {
  const ms = getEnv().WHISPER_IDLE_SHUTDOWN_MS;
  if (!ms || getEnv().WHISPER_SERVER_URL) return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (starting) return;
    killSidecar();
  }, ms);
}

export function cancelWhisperIdleShutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

const g = globalThis as typeof globalThis & { __lecternKillWhisper?: boolean };
if (!g.__lecternKillWhisper) {
  g.__lecternKillWhisper = true;
  process.once("exit", killSidecar);
}
