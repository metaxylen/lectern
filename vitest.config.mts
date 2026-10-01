import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "e2e"],
    setupFiles: ["./vitest.setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: [
        "lib/stt/whisper.worker.ts",
        "lib/stt/empty-module.ts",
        "lib/server/stt/server.ts",
        "**/*.test.ts",
      ],
      reporter: ["text-summary", "html"],
      thresholds: { statements: 75, branches: 70, functions: 75, lines: 75 },
    },
  },
});
