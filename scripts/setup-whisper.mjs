#!/usr/bin/env node
/**
 * Install whisper.cpp (Metal on Apple Silicon) and the large-v3-turbo weights.
 *
 * Layout:
 *   ~/.local/share/lectern/whisper/bin/whisper-server
 *   ~/.local/share/lectern/whisper/ggml-large-v3-turbo.bin
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = path.join(homedir(), ".local");
const DATA = path.join(ROOT, "share", "lectern", "whisper");
const BIN = path.join(DATA, "bin", "whisper-server");
const MODEL = path.join(DATA, "ggml-large-v3-turbo.bin");
const SRC = path.join(ROOT, "src", "whisper.cpp");
const CMAKE_VERSION = "3.31.8";
const CMAKE_URL = `https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-macos-universal.tar.gz`;
const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin";
/** F16 large-v3-turbo is a bit over 1.5 GB; reject truncated downloads. */
const MODEL_MIN_BYTES = 1_400_000_000;

function log(msg) {
  console.log(msg);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    log(`$ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

async function download(url, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) {
    log(`already have ${dest}`);
    return;
  }
  const partial = `${dest}.partial`;
  log(`downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`GET ${url} → ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(partial));
  const { renameSync } = await import("node:fs");
  renameSync(partial, dest);
}

function which(name) {
  const dirs = (process.env.PATH ?? "").split(path.delimiter);
  for (const dir of dirs) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function ensureCmake() {
  const existing = which("cmake");
  if (existing) return existing;
  const extractDir = path.join(ROOT, "opt");
  const cmakeBin = path.join(
    extractDir,
    `cmake-${CMAKE_VERSION}-macos-universal`,
    "CMake.app",
    "Contents",
    "bin",
    "cmake",
  );
  if (!existsSync(cmakeBin)) {
    const tarball = path.join(ROOT, "tmp", "cmake-macos.tar.gz");
    await download(CMAKE_URL, tarball);
    mkdirSync(extractDir, { recursive: true });
    await run("tar", ["-xzf", tarball, "-C", extractDir]);
  }
  if (!existsSync(cmakeBin)) throw new Error(`cmake not found at ${cmakeBin}`);
  const link = path.join(ROOT, "bin", "cmake");
  mkdirSync(path.dirname(link), { recursive: true });
  try {
    const { symlinkSync, unlinkSync } = await import("node:fs");
    try {
      unlinkSync(link);
    } catch {
      // missing
    }
    symlinkSync(cmakeBin, link);
  } catch {
    // symlink optional
  }
  return cmakeBin;
}

async function ensureBinary(cmake) {
  if (existsSync(BIN)) {
    log(`whisper-server already at ${BIN}`);
    return;
  }
  if (!existsSync(path.join(SRC, ".git"))) {
    mkdirSync(path.dirname(SRC), { recursive: true });
    await run("git", ["clone", "--depth", "1", "https://github.com/ggml-org/whisper.cpp.git", SRC]);
  }
  const metal = process.platform === "darwin" ? ["-DGGML_METAL=ON"] : ["-DGGML_METAL=OFF"];
  await run(cmake, ["-B", "build", "-DWHISPER_BUILD_TESTS=OFF", ...metal], { cwd: SRC });
  const jobs = String(Math.max(2, Number(process.env.JOBS) || 4));
  await run(
    cmake,
    ["--build", "build", "-j", jobs, "--config", "Release", "--target", "whisper-server"],
    {
      cwd: SRC,
    },
  );
  const built = path.join(SRC, "build", "bin", "whisper-server");
  if (!existsSync(built)) throw new Error(`build finished but ${built} is missing`);
  mkdirSync(path.dirname(BIN), { recursive: true });
  copyFileSync(built, BIN);
  chmodSync(BIN, 0o755);
  const binDir = path.dirname(built);
  const destDir = path.dirname(BIN);
  const { readdirSync } = await import("node:fs");
  for (const name of readdirSync(binDir)) {
    if (name.endsWith(".dylib") || name.includes("metal")) {
      copyFileSync(path.join(binDir, name), path.join(destDir, name));
    }
  }
  if (process.platform === "darwin") {
    await run("install_name_tool", ["-add_rpath", "@loader_path", BIN]).catch(() => {});
  }
  log(`installed ${BIN}`);
}

async function ensureModel() {
  const { statSync } = await import("node:fs");
  if (existsSync(MODEL) && statSync(MODEL).size >= MODEL_MIN_BYTES) {
    log(`model already at ${MODEL}`);
    return;
  }
  await download(MODEL_URL, MODEL);
  const size = statSync(MODEL).size;
  if (size < MODEL_MIN_BYTES) {
    throw new Error(`model looks truncated (${size} bytes). Delete ${MODEL} and re-run.`);
  }
  log(`model ${MODEL} (${(size / 1e9).toFixed(2)} GB)`);
}

async function main() {
  mkdirSync(DATA, { recursive: true });
  mkdirSync(path.join(DATA, "bin"), { recursive: true });
  const cmake = await ensureCmake();
  await ensureBinary(cmake);
  await ensureModel();
  log("");
  log("Whisper large-v3-turbo is ready.");
  log(`  server  ${BIN}`);
  log(`  model   ${MODEL}`);
  log("Restart `npm run dev` if it is already running, then record as usual.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
