# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-09-30

### Added

- **Audio sources**: microphone with device selection (including virtual loopback inputs), browser tab or screen audio, and tab
  audio mixed with the microphone. Clear errors for denied, cancelled and audio-less shares.
- **Live transcript** rebuilt on Whisper: a live draft of the current part, for every source, that never delays final results.
- Project renamed to **Lectern**, with a logo, favicon and full documentation set.

### Changed

- Model choice prefers the newest installed family and the largest model that fits in the machine's memory; reasoning mode is
  switched off so JSON comes back directly.
- Browser speech recognition is now only a stopgap for microphone recordings while the model loads.

### Fixed

- CI type checking on a clean checkout (route types are generated before `tsc`).

## [0.2.0] - 2026-09-30

### Added

- **Notes pipeline**: transcript cleaning, single-pass and part-by-part summarization, JSON Schema constrained output with a
  repair retry, grounding against the transcript, a dedicated exam-remark pass, a Turkish technical-term dictionary.
- New outputs: chapters with timestamps, exam and homework notes, flashcards with Anki export, quality warnings.
- Course or topic hints; streaming progress and cancellation for note generation.
- `npm run eval` quality harness with fixture lectures.

## [0.1.1] - 2026-09-29

### Added

- **Reliable recording**: audio written to IndexedDB while recording, recovery of interrupted recordings, per-part retry,
  re-transcribe, cancel, stored audio with playback, timestamped transcript, downloaded-model management.

### Fixed

- Transcripts without sentence punctuation produced an empty prompt for the language model.
- Whisper could not load on machines that expose WebGPU without a usable GPU.

## [0.1.0] - 2026-09-29

### Added

- Project foundation: modular structure, validated API with rate and size limits, error boundaries and reporting,
  unit and end-to-end tests, CI, formatting and linting.
