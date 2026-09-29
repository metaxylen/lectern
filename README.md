# stt — free lecture note-taker

Record a lecture (or upload an audio file), watch the transcript appear, then get structured study notes:
**title, summary, key points, definitions, likely exam questions** (and an optional **Turkish glossary** of key terms).
It is tuned for lectures that are ~90% English with ~10% Turkish code-switching. Notes can be copied or downloaded as
Markdown, and past lectures are saved in your browser (`localStorage`).

**It costs nothing to run: no paid API, no account, no required key.** Nothing is sent to a paid service.

Stack: Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui.

## Run it

```bash
npm install
npm run dev        # http://localhost:47231
```

Production: `npm run build && npm start` (also port 47231). Use `localhost` or HTTPS — browsers only allow microphone
access there.

## How it works

### Speech to text (mixed English + Turkish)

| Mode                                         | What it is                                                                                                                                                                                                                                                                                                                                   | Cost / privacy                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Whisper in the browser** (main transcript) | [transformers.js](https://huggingface.co/docs/transformers.js) runs OpenAI's open-source Whisper weights inside a Web Worker, on **WebGPU** when available and **WASM** (CPU) otherwise. Default model: **small** when WebGPU is available, **base** otherwise (tiny/base/small selectable).                                                 | Free. Audio never leaves your machine. The model (~80 MB base, ~250 MB small) is downloaded from Hugging Face on first use and cached by the browser afterwards. |
| **Web Speech API** (live preview)            | While recording, the browser's built-in `SpeechRecognition` shows a fast grey-italic preview, **en-US by default** (`tr-TR` if you pick Türkçe). It handles one language at a time, so Turkish asides look wrong here; Whisper replaces the preview as each chunk finishes. If Whisper cannot load, the preview text becomes the transcript. | Free. Chrome/Edge send audio to their vendor's speech service, so this is the only non-local piece; unsupported in Firefox.                                      |

**Language handling.** The _Lecture language_ setting defaults to **Auto-detect per chunk (English + Turkish)**; the
other choice for a fully English lecture is **English (primary)**, which forces English (Turkish sentences would then be
garbled). Whisper always _transcribes_, it never translates: a Turkish sentence stays Turkish in the transcript.

transformers.js has no built-in Whisper language detection (it silently assumes English), so `lib/stt/detect-language.ts`
runs one decoder step and compares the `<|en|>` and `<|tr|>` logits for each chunk, then transcribes that chunk with the
winning language. Because detection happens per chunk, recording and uploads use short **20 s** windows
(`NEXT_PUBLIC_CHUNK_SECONDS`, sensible range 15–30) so a Turkish sentence gets its own chunk. If a Turkish remark shares
a chunk with English, the whole chunk gets one language; shorten the chunk size if that bites. Detection adds one extra
encoder pass per chunk.

Recording uses `MediaRecorder`, cut into standalone chunks. Chunks are decoded to 16 kHz mono and transcribed one after
another so the order is preserved. Uploaded files are decoded and split the same way (mp3, wav, m4a, ogg, webm, flac —
whatever your browser can decode).

### Notes generation

_Notes language_ defaults to **English + Turkish glossary**: English notes, Turkish parts of the lecture kept, plus a
table of key terms with Turkish equivalents. Other options: English only, Türkçe (English terms kept in parentheses),
and a few other languages.

Engines are chosen automatically in this order (or force one in the _Notes engine_ dropdown):

1. **Ollama** — if a local [Ollama](https://ollama.com) server is reachable at `OLLAMA_HOST` (default
   `http://127.0.0.1:11434`). Uses `OLLAMA_MODEL`, otherwise the first installed model among qwen2.5, qwen3, llama3,
   gemma, mistral, phi. Try `ollama pull qwen2.5:7b`. Very long transcripts are first condensed to fit the context window.
2. **Gemini free tier** — only if you set `GEMINI_API_KEY` (get one free at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey)); model `GEMINI_MODEL` (default `gemini-flash-latest`).
   The transcript is sent to Google when this is used.
3. **Built-in offline summarizer** — zero setup, always works. Scores sentences by term frequency and cue words
   ("important", "exam", "sınav"…), picks the summary and key points, detects definitions ("X is a…", "X, Y'dir",
   "X denir") and turns them into exam questions. It selects sentences from the transcript as spoken, so Turkish asides are
   kept verbatim, but it **cannot translate or build the Turkish glossary**; use Ollama or Gemini for those.

The Ollama and Gemini prompt tells the model that the transcript is mixed English/Turkish speech-recognition output that
may contain recognition errors, to fix obvious ones from context, to keep the Turkish remarks (e.g. exam hints), and to
write in the selected notes language.

The header shows which engines are available right now, and each set of notes is labelled with the engine that made it
(plus why earlier engines were skipped).

### Configuration (all optional)

Copy `.env.example` to `.env.local` and set what you need: `OLLAMA_HOST`, `OLLAMA_MODEL`, `GEMINI_API_KEY`,
`GEMINI_MODEL`, `NEXT_PUBLIC_CHUNK_SECONDS`.

## Project layout

- `components/lecture-app.tsx` — thin composition of the panels in `components/lecture/`
  (`app-header`, `session-setup`, `recorder-panel`, `transcript-panel`, `notes-section`, `engine-strip`)
- `hooks/use-lecture-session.ts` — the whole record → transcribe → notes flow and its state
- `hooks/use-whisper.ts`, `lib/stt/whisper.worker.ts`, `lib/stt/detect-language.ts` — local Whisper in a worker, with per-chunk language detection
- `hooks/use-recorder.ts`, `hooks/use-speech-preview.ts` — microphone chunks and Web Speech preview
- `app/api/notes`, `app/api/status`, `app/api/health` — HTTP API (validated with zod, rate limited, uniform `{ error, code }` errors)
- `lib/server/notes/` — prompt, JSON normalization, Ollama and Gemini engines, and the fallback chain
- `lib/server/env.ts` — validated server environment; `lib/server/rate-limit.ts` — in-memory limiter
- `lib/extractive.ts` — offline summarizer (also used in the browser if the server is unreachable)
- `lib/notes-client.ts` — browser side of `/api/notes` with offline fallback
- `lib/storage.ts`, `lib/schemas.ts` — past lectures in `localStorage`, validated on read
- `lib/monitoring.ts`, `instrumentation.ts`, `app/error.tsx`, `app/global-error.tsx` — error reporting and boundaries

## Development

Requires Node 22 (`.nvmrc`).

| Command                           | What it does                                                        |
| --------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                     | Dev server on port 47231                                            |
| `npm run check`                   | Typecheck + lint + format check + unit tests (run before pushing)   |
| `npm test` / `npm run test:watch` | Unit and API tests (Vitest)                                         |
| `npm run test:coverage`           | Same, with coverage thresholds                                      |
| `npm run test:e2e`                | Browser tests (Playwright); builds and serves the app on port 47232 |
| `npm run format`                  | Prettier (with Tailwind class sorting)                              |

First e2e run: `npx playwright install chromium`. E2E tests never download Whisper models; they seed
`localStorage` and use the offline engine, so they are fast and deterministic.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, coverage and build, then the e2e suite.

### Operations

- `GET /api/health` — liveness probe (no external calls).
- `/api/notes` limits: `NOTES_RATE_LIMIT_PER_MINUTE` (default 20 per client) and `NOTES_MAX_TRANSCRIPT_CHARS`
  (default 500 000). The limiter is in-memory and per process; use a shared store before running several instances,
  and only trust `x-forwarded-for` behind a proxy you control.
- Invalid environment values fail with a readable message (HTTP 500 `misconfigured`) instead of undefined behaviour.
- Errors are logged as `[error] ...` and, if `NEXT_PUBLIC_ERROR_REPORT_URL` is set, POSTed there as JSON.

## Known limits

## Known limits

- First Whisper run needs internet once (model download); after that it works offline, apart from the Web Speech preview.
- Whisper `small` on CPU/WASM is slower than real time on weak machines; use WebGPU (Chrome/Edge) or pick `base`.
- Auto-detect chooses between English and Turkish only; for a lecture in another language pick it explicitly.
- Lectures are stored per browser profile; clearing site data removes them (download the Markdown to keep a copy).
