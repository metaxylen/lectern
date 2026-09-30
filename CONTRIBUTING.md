# Contributing to Lectern

Thanks for helping. Bug reports, transcripts that break the pipeline, and pull requests are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Lectern is local-first. Changes that send user audio or transcripts to a service by default will not be accepted; optional,
  clearly labelled integrations are fine.

## Setup

```bash
git clone https://github.com/metaxylen/lectern.git
cd lectern
npm install
npx playwright install chromium     # once, for the end-to-end tests
npm run dev
```

Node.js 22+ is required. See [docs/development.md](docs/development.md) for the commands and test layout.

## Making a change

1. Branch from `main`.
2. Keep the change focused. Put logic in `lib/` as pure, tested functions; hooks orchestrate; components render.
3. Add or update tests. Bug fixes need a test that fails without the fix.
4. Run `npm run check` and, if you touched UI or recording, `npm run test:e2e`.
5. If you changed prompts, the pipeline or model selection, run `npm run eval` against a real model and include the scores
   in the pull request.
6. Open a pull request using the template.

## Reporting a bad transcript or bad notes

Please include: the browser and OS, the Whisper model and language setting, the notes engine and model (shown above the
notes), and if you can share it, a short transcript excerpt. Do **not** attach private audio.

## Style

- TypeScript strict mode, no `any` without a comment explaining why.
- Prettier formats everything (`npm run format`); ESLint must be clean.
- Error messages are written for the user, not for the developer.
