# Notes pipeline

How a transcript becomes study notes (`lib/server/notes/` and `lib/notes/`). The goal is notes that are **faithful to what
the lecturer said**, because a small model will otherwise produce confident, plausible, wrong study material.

## Stages

1. **Clean** (`lib/notes/clean.ts`). Removes Whisper's stock hallucinations ("Thank you.", "Altyazı M.K.", "[Music]"),
   consecutive duplicate segments, stuttered words and repeated phrases, and filler words. Timestamps are preserved.
2. **Plan.** If the cleaned transcript fits the engine's single-pass budget it is summarized in one call, with `[m:ss]`
   markers so chapters can cite where they begin. Otherwise it is cut into parts (`lib/notes/chunk.ts`).
3. **Generate** (`pipeline.ts`, `prompt.ts`). Ollama receives a JSON Schema (`lib/notes/schema.ts`) so decoding is
   constrained; every engine's output is parsed and normalized (`normalize.ts`: trimming, de-duplication, caps).
   Invalid output is shown back to the model **once** ("your answer was rejected because ..."); after that the pipeline gives up
   on that engine (or, for one part of a long lecture, substitutes the offline summary and warns).
4. **Long lectures.** Each part yields a small digest (title, summary, key points, definitions). A merge call turns the digests into
   the final notes. **Chapters are built from the parts**, so their timestamps are exact by construction rather than
   cited by the model.
5. **Exam remarks, separately.** `lib/notes/hints.ts` finds segments containing assessment wording in English or Turkish
   (_exam, midterm, homework, due, remember, sınav, vize, ödev, ezber, mutlaka, ..._) and adds the segment before each for
   context. A dedicated small call turns them into self-contained instructions in the notes language. This pass is the
   **only source of exam hints**: when asked for them among other tasks, models skip real ones and invent others. If the
   transcript contains no assessment wording, there are no hints. If the pass fails, the model's own hints are used as a fallback.
6. **Verify** (`lib/notes/ground.ts`). Definitions and glossary entries whose term cannot be found in the transcript are
   dropped and reported as warnings. Terms in another language count as supported when their English parenthetical, or the English
   term behind a known Turkish wording, is in the transcript; terms that cannot be judged are kept.
7. **Correct Turkish terms** (`lib/notes/terms.ts`). A dictionary of ~120 established technical terms is injected into the
   prompt for terms that occur in the lecture, and the final glossary is corrected against it (for example _race
   condition → yarış durumu_, _deadlock → kilitlenme_).

## Engines

| Engine  | Used when                                            | Single-pass budget                    |
| ------- | ---------------------------------------------------- | ------------------------------------- |
| Ollama  | reachable; model chosen by family preference and RAM | 16,000 characters (16k-token context) |
| Gemini  | `GEMINI_API_KEY` set                                 | 300,000 characters                    |
| Offline | always                                               | n/a (extractive)                      |

`auto` tries them in that order and reports why each earlier one was skipped. A forced engine fails loudly instead of
degrading silently. Requests stream progress and stop the model when the client disconnects or cancels.

## Evaluating changes

`npm run eval` (`eval/`) runs real engines on fixture lectures and scores:

- **concept coverage**: how many of the lecture's main concepts appear in the notes
- **exam-remark recall**: whether each assessment remark the lecturer made is reported
- **forbidden leaks**: uncorrected ASR errors ("mew tex") and transcript junk ("Thank you") must not appear
- **structure**: enough key points and questions, chapters present

```bash
npm run eval                                   # default: Ollama
EVAL_ENGINE=gemini npm run eval                # another engine
OLLAMA_MODEL=gemma4:12b EVAL_SHOW=1 EVAL_ONLY=Turkish npm run eval   # one fixture, print the notes
```

Run it after changing prompts, the pipeline, or the model. It takes minutes and keeps the GPU busy, so it is not part of
`npm test`.
