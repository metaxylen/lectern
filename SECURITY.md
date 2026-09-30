# Security Policy

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it and the impact.
You can expect an acknowledgement within a few days.

## Scope and design notes

- Audio, transcripts and notes are stored in the user's browser (IndexedDB, `localStorage`). They are sent to the server only
  when notes are generated, and from there only to the configured engine (local Ollama, or Gemini if the operator set a key).
- `/api/notes` validates input, limits size and request rate per client, and never echoes secrets. `GEMINI_API_KEY` is read
  from the server environment and sent only in a request header to Google.
- If you expose Lectern beyond `localhost`, put it behind authentication and a reverse proxy you control: the rate limiter is
  per process and the app has no user accounts.
- Dependencies are kept current by Dependabot.
