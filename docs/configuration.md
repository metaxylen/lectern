# Configuration

Environment variables are read on the server and validated with zod on first use (`lib/server/env.ts`). An invalid value
produces a readable error and an HTTP 500 `misconfigured` response instead of undefined behaviour. Empty values count as unset.

| Variable                       | Default                                                  | Description                                                                |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `OLLAMA_HOST`                  | `http://127.0.0.1:11434`                                 | Base URL of the Ollama server (trailing slashes are removed)               |
| `OLLAMA_MODEL`                 | _(auto)_                                                 | Use exactly this model instead of the automatic choice                     |
| `OPENAI_BASE_URL`              | `https://api.openai.com/v1`                              | Base URL for an OpenAI Chat Completions-compatible server                  |
| `OPENAI_API_KEY`               | _(unset)_                                                | Enables the OpenAI-compatible engine; sent only as a bearer header         |
| `OPENAI_MODEL`                 | `gpt-4o-mini`                                            | Model name sent to the OpenAI-compatible server                            |
| `LECTERN_GEMINI_ENABLED`       | `true`                                                   | Set to `false` to ignore a system-wide `GEMINI_API_KEY`                    |
| `GEMINI_API_KEY`               | _(unset)_                                                | Enables Gemini. The key is only ever sent in a request header              |
| `GEMINI_MODEL`                 | `gemini-flash-latest`                                    | Gemini model name                                                          |
| `NOTES_MAX_TRANSCRIPT_CHARS`   | `500000`                                                 | Largest transcript accepted by `/api/notes` (413 above)                    |
| `NOTES_RATE_LIMIT_PER_MINUTE`  | `20`                                                     | Requests per minute per client for `/api/notes`; `0` disables the limit    |
| `NEXT_PUBLIC_CHUNK_SECONDS`    | `20`                                                     | Length of each recorded part (15–30 is sensible)                           |
| `NEXT_PUBLIC_ERROR_REPORT_URL` | _(unset)_                                                | Every unique error is POSTed here as JSON                                  |
| `WHISPER_MODEL_PATH`           | `~/.local/share/lectern/whisper/ggml-large-v3-turbo.bin` | ggml weights for whisper.cpp                                               |
| `WHISPER_SERVER_BIN`           | `~/.local/share/lectern/whisper/bin/whisper-server`      | Sidecar binary. Install with `npm run whisper:setup`.                      |
| `WHISPER_SERVER_URL`           | _(unset)_                                                | If set, Lectern will not spawn a sidecar and will call this server instead |
| `WHISPER_PORT`                 | `8178`                                                   | Port of the spawned sidecar (`127.0.0.1` only)                             |
| `STT_MAX_AUDIO_BYTES`          | `8000000`                                                | Largest WAV accepted by `/api/transcribe`                                  |
| `STT_RATE_LIMIT_PER_MINUTE`    | `90`                                                     | Requests per minute per client for `/api/transcribe`; `0` disables         |

## Automatic model choice

Ollama models are ranked by family, newest first: `gemma4`, `qwen3.8`, `qwen3.6`, `qwen3`, `gemma3`, `qwen2.5`, `llama3`,
`mistral`, `phi`. Within the first installed family the largest model that fits in 60% of physical memory is used; if none
fits, the smallest. Embedding models are ignored.

## OpenAI-compatible servers

Set the three `OPENAI_*` variables in `.env.local` to use OpenAI or a compatible service such as
OpenRouter, LM Studio, or vLLM. `OPENAI_BASE_URL` should end at the API version, usually `/v1`; Lectern
appends `/chat/completions`. The key stays on the server and is never sent to the browser.

```dotenv
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4o-mini
```

Automatic engine selection tries Ollama first, then the configured OpenAI-compatible endpoint, then
Gemini, and finally the offline summarizer. The Session options menu also lets you force the
OpenAI-compatible engine.

## Running behind a proxy

The rate limiter keys on `x-forwarded-for` (falling back to `x-real-ip`). Only trust that header behind a proxy you
control; otherwise all clients share one bucket. The limiter is in memory, so use a shared store before running several
instances.

## Ports

`npm run dev` and `npm start` listen on `0.0.0.0:47231`. The end-to-end tests use `47232`.
