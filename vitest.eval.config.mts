import path from "node:path";
import { defineConfig } from "vitest/config";

// Quality evaluation of the notes pipeline against a real engine (Ollama or Gemini).
// Run with `npm run eval`. Not part of `npm test`: it needs a model and takes minutes.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
  test: {
    environment: "node",
    include: ["eval/**/*.eval.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ["verbose"],
  },
});
