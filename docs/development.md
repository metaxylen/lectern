# Development

Requires Node.js 22 (`.nvmrc`).

```bash
npm install
npm run dev
```

## Commands

| Command                           | What it does                                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| `npm run check`                   | Typecheck, lint, format check and unit tests: run before pushing  |
| `npm test` / `npm run test:watch` | Vitest unit and API tests                                         |
| `npm run test:coverage`           | Same with coverage thresholds (CI)                                |
| `npm run test:e2e`                | Playwright against a production build on port 47232               |
| `npm run eval`                    | Notes quality against a real engine                               |
| `npm run whisper:setup`           | Build whisper.cpp (Metal) and download `large-v3-turbo` (~1.6 GB) |
| `npm run format`                  | Prettier, with Tailwind class sorting                             |

## Tests

- **Unit and API** (`*.test.ts`): pure logic, the IndexedDB store (fake-indexeddb), prompts, the pipeline with fake language
  models, and the route handlers.
- **End to end** (`e2e/`): seeded `localStorage`/IndexedDB, Chromium's fake microphone, and mocked API responses. They never
  download Whisper models, so they are fast and deterministic. A fixture fails any test that logs an unexpected browser error.
- **Opt-in real model** (`E2E_WHISPER=1`): uploads and records synthesized speech (macOS `say`) and runs the real tiny
  in-browser Whisper model end to end. Native `large-v3-turbo` is not downloaded in CI.
- **Screenshots**: `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts` regenerates `docs/images`.

## Conventions

- Strict TypeScript; `@/` maps to the repository root.
- Logic lives in `lib/` as pure functions with tests; hooks orchestrate, components render.
- Browser and network access is injected where it needs testing (`fetch`, media devices, clocks).
- Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before relying on memory.
- Commit messages: a short imperative summary, then what changed and why.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request: typecheck (`next typegen` first, because route types are
generated), lint, format check, unit tests with coverage, production build, then the end-to-end suite.
