"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAudioPlayer } from "@/hooks/use-audio-player";
import { listAudioInputs, type AudioInput, type AudioSource } from "@/lib/audio/capture";
import { startPcmTap, type PcmTap } from "@/lib/audio/pcm-tap";
import { LiveTranscriber } from "@/lib/stt/live";
import { useRecorder, type RecordedChunk } from "@/hooks/use-recorder";
import { useSpeechPreview } from "@/hooks/use-speech-preview";
import { MODEL_NATIVE, useWhisper } from "@/hooks/use-whisper";
import {
  createSession,
  deleteSession,
  estimateStorage,
  getChunks,
  getSession,
  listUnfinishedSessions,
  patchChunk,
  putChunk,
  requestPersistentStorage,
  updateSession,
  type AudioChunk,
  type AudioSession,
} from "@/lib/audio-store";
import {
  DEFAULT_NOTES_LANGUAGE,
  DEFAULT_SPEECH_LANGUAGE,
  parseNotesLanguage,
} from "@/lib/languages";
import { newLecture } from "@/lib/lecture";
import { downloadLectureAudio } from "@/lib/export/audio";
import { lectureToMarkdown, slugify } from "@/lib/markdown";
import { reportError } from "@/lib/monitoring";
import { requestNotes } from "@/lib/notes-client";
import { joinSegments, sortSegments } from "@/lib/segments";
import { deleteLecture, saveLecture, useLectures } from "@/lib/storage";
import { decodeToMono16k } from "@/lib/stt/audio";
import { shortModelName } from "@/lib/stt/models";
import { CancelledError, transcribeSamples } from "@/lib/stt/pipeline";
import type { EngineStatus, Lecture, NotesEngineChoice, NotesResult, Segment } from "@/lib/types";

export type SourceChoice = "mic" | "tab" | "tab-mic";

export type NotesMeta = Pick<NotesResult, "engine" | "model" | "fallbackReasons"> &
  Partial<Pick<NotesResult, "warnings" | "elapsedMs">>;

/** What is stored on this device for the open lecture. */
export type AudioInfo = { bytes: number; chunks: number; incomplete: number };

/** Recordings idle for this long are considered abandoned (not live in another tab). */
const ABANDONED_AFTER_MS = 30_000;
const LOW_STORAGE_BYTES = 200 * 1024 * 1024;

const STORAGE_FULL_MESSAGE =
  "Could not save to this browser (storage is full or blocked). Download the Markdown to keep a copy.";

function persist(lecture: Lecture) {
  if (!saveLecture(lecture)) toast.error(STORAGE_FULL_MESSAGE);
}

type ChunkInput = Pick<AudioChunk, "index" | "blob" | "mimeType" | "durationSec" | "status"> & {
  segments?: Segment[];
};

/**
 * Owns the whole record → transcribe → notes flow and all of its state, so the UI components
 * stay presentational. Refs mirror state that async callbacks need to read without going stale.
 *
 * Audio is written to IndexedDB as it is captured (see lib/audio-store.ts). Persistence is always
 * best effort: if IndexedDB is unavailable the flow still works, just without crash recovery.
 */
export function useLectureSession() {
  const lectures = useLectures();

  // --- settings -----------------------------------------------------------------------------
  const [audioLang, setAudioLang] = useState(DEFAULT_SPEECH_LANGUAGE);
  const [notesLang, setNotesLang] = useState(DEFAULT_NOTES_LANGUAGE);
  const [engineChoice, setEngineChoice] = useState<NotesEngineChoice>("auto");
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const modelId = modelChoice ?? MODEL_NATIVE;

  // --- session state ------------------------------------------------------------------------
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [current, setCurrent] = useState<Lecture | null>(null);
  const [notesMeta, setNotesMeta] = useState<NotesMeta | null>(null);
  const [pending, setPending] = useState(0);
  const [partsProgress, setPartsProgress] = useState<{ done: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("mic");
  const [micDeviceId, setMicDeviceId] = useState("");
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [live, setLive] = useState<{ text: string; language?: string }>({ text: "" });
  const [notesProgress, setNotesProgress] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [finalizing, setFinalizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [unfinished, setUnfinished] = useState<AudioSession[]>([]);
  const [audioInfo, setAudioInfo] = useState<AudioInfo | null>(null);
  const [persistenceOk, setPersistenceOk] = useState(true);

  const whisper = useWhisper(modelId);
  const preview = useSpeechPreview();

  const whisperRef = useRef(whisper);
  const segmentsRef = useRef<Segment[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentRef = useRef<Lecture | null>(null);
  const cancelRef = useRef(false);
  const pendingRef = useRef(0);
  const tapRef = useRef<PcmTap | null>(null);
  const liveRef = useRef<LiveTranscriber | null>(null);
  const notesAbortRef = useRef<AbortController | null>(null);
  const failedRef = useRef(0);
  const persistOkRef = useRef(true);
  const hasSessionRef = useRef(false);
  /** Timeline position (seconds) where the next live chunk begins. */
  const liveCursorRef = useRef({ t: 0 });
  const settings = useRef({
    audioLang,
    notesLang,
    engineChoice,
    modelId,
    context,
    sourceChoice,
    micDeviceId,
    liveEnabled,
  });

  useEffect(() => {
    settings.current = {
      audioLang,
      notesLang,
      engineChoice,
      modelId,
      context,
      sourceChoice,
      micDeviceId,
      liveEnabled,
    };
    whisperRef.current = whisper;
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: EngineStatus | null) => s && setEngines(s))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // --- persistence helpers ------------------------------------------------------------------
  const markPersistenceFailed = useCallback((err: unknown) => {
    if (!persistOkRef.current) return;
    persistOkRef.current = false;
    setPersistenceOk(false);
    reportError(err, { source: "audio-store" });
  }, []);

  /** Serialize IndexedDB writes so a late partial can never overwrite a newer chunk. */
  const write = useCallback(
    (op: () => Promise<unknown>) => {
      writeQueueRef.current = writeQueueRef.current
        .then(async () => {
          await op();
        })
        .catch(markPersistenceFailed);
      return writeQueueRef.current;
    },
    [markPersistenceFailed],
  );

  const refreshAudioInfo = useCallback(async (lecture: Lecture | null) => {
    if (!lecture?.hasAudio) {
      setAudioInfo(null);
      return;
    }
    try {
      const chunks = await getChunks(lecture.id);
      setAudioInfo({
        bytes: chunks.reduce((n, c) => n + c.blob.size, 0),
        chunks: chunks.length,
        incomplete: chunks.filter((c) => c.status === "pending" || c.status === "failed").length,
      });
    } catch {
      setAudioInfo(null);
    }
  }, []);

  const refreshUnfinished = useCallback(async () => {
    try {
      setUnfinished(await listUnfinishedSessions(ABANDONED_AFTER_MS));
    } catch {
      setUnfinished([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listUnfinishedSessions(ABANDONED_AFTER_MS)
      .then((list) => !cancelled && setUnfinished(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // --- lecture state helpers ----------------------------------------------------------------
  const setLecture = useCallback((lecture: Lecture | null) => {
    currentRef.current = lecture;
    setCurrent(lecture);
  }, []);

  const patchCurrent = useCallback(
    (patch: Partial<Lecture>) => {
      const c = currentRef.current;
      if (c) setLecture({ ...c, ...patch });
    },
    [setLecture],
  );

  const setSegments = useCallback(
    (segments: Segment[]) => {
      segmentsRef.current = sortSegments(segments);
      patchCurrent({
        segments: segmentsRef.current,
        transcript: joinSegments(segmentsRef.current),
      });
    },
    [patchCurrent],
  );

  const addSegments = useCallback(
    (added: Segment[]) => {
      if (added.length) setSegments([...segmentsRef.current, ...added]);
    },
    [setSegments],
  );

  const enqueue = useCallback((job: () => Promise<void>) => {
    pendingRef.current += 1;
    setPending((p) => p + 1);
    queueRef.current = queueRef.current
      .then(job)
      .catch((err) => {
        if (err instanceof CancelledError) return;
        reportError(err, { source: "transcription" });
        toast.error(`Transcription failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        pendingRef.current -= 1;
        setPending((p) => p - 1);
      });
  }, []);

  // --- transcription ------------------------------------------------------------------------
  /**
   * Transcribe one chunk. Chunks already done are skipped but still advance the timeline, so
   * resuming a half-finished session keeps every timestamp correct. Jobs run one at a time.
   */
  const processChunk = useCallback(
    async (lectureId: string, chunk: ChunkInput, cursor: { t: number }) => {
      if (chunk.status === "done" || chunk.status === "silent") {
        cursor.t += chunk.durationSec;
        return;
      }
      if (cancelRef.current) throw new CancelledError();
      await writeQueueRef.current; // the chunk must be stored before we patch it
      try {
        const samples = await decodeToMono16k(chunk.blob);
        const result = await transcribeSamples(samples, {
          startSec: cursor.t,
          language: settings.current.audioLang,
          transcribe: (audio, language) => whisperRef.current.transcribe(audio, language),
          shouldCancel: () => cancelRef.current,
          onProgress: (done, total) => total > 1 && setPartsProgress({ done, total }),
        });
        cursor.t += result.durationSec;
        addSegments(result.segments);
        void write(() =>
          patchChunk(lectureId, chunk.index, {
            status: result.silent ? "silent" : "done",
            segments: result.segments,
            durationSec: result.durationSec,
            error: undefined,
          }),
        );
      } catch (err) {
        if (err instanceof CancelledError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        cursor.t += chunk.durationSec;
        failedRef.current += 1;
        void write(() => patchChunk(lectureId, chunk.index, { status: "failed", error: message }));
        reportError(err, { source: "transcription", chunk: chunk.index });
        toast.error(`Could not transcribe part ${chunk.index + 1}: ${message}`);
      }
    },
    [addSegments, write],
  );

  // --- notes --------------------------------------------------------------------------------
  const generateNotes = useCallback(
    async (lecture: Lecture) => {
      if (!lecture.transcript.trim()) return;
      setGenerating(true);
      setNotesProgress("Preparing");
      const abort = new AbortController();
      notesAbortRef.current = abort;
      try {
        const { notesLang: nl, engineChoice: engine, context: hints } = settings.current;
        const result = await requestNotes(
          {
            transcript: lecture.transcript,
            segments: lecture.segments,
            context: hints,
            notesLanguage: nl,
            engine,
          },
          {
            signal: abort.signal,
            onProgress: (message, done, total) =>
              setNotesProgress(total ? `${message} (${done ?? 0}/${total})` : message),
          },
        );
        const parsed = parseNotesLanguage(nl);
        const updated: Lecture = {
          ...lecture,
          title: result.notes.title || lecture.title,
          notes: result.notes,
          notesLanguage: parsed.language,
          notesGlossary: parsed.glossary,
          notesEngine: result.engine,
          context: hints?.trim() || undefined,
        };
        persist(updated);
        if (currentRef.current?.id === updated.id) {
          setLecture(updated);
          setNotesMeta({
            engine: result.engine,
            model: result.model,
            fallbackReasons: result.fallbackReasons,
            warnings: result.warnings,
            elapsedMs: result.elapsedMs,
          });
        }
        toast.success("Notes are ready");
      } catch (err) {
        if (abort.signal.aborted) toast("Notes generation cancelled");
        else toast.error(err instanceof Error ? err.message : "Could not generate notes");
      } finally {
        notesAbortRef.current = null;
        setNotesProgress(null);
        setGenerating(false);
      }
    },
    [setLecture],
  );

  /** Wait for transcription to drain, then save the lecture and (unless cancelled) write notes. */
  const finalize = useCallback(
    async (opts: { previewText?: string; keepNotes?: boolean } = {}) => {
      setFinalizing(true);
      try {
        await queueRef.current;
        await writeQueueRef.current;
        const cancelled = cancelRef.current;
        cancelRef.current = false;
        let lecture = currentRef.current;
        if (!lecture) return;

        let segments = segmentsRef.current;
        let sttEngine = lecture.sttEngine;
        if (!segments.length && opts.previewText?.trim()) {
          segments = [
            {
              start: 0,
              end: liveCursorRef.current.t,
              text: opts.previewText.trim(),
              language: "en",
            },
          ];
          sttEngine = "Web Speech API (fallback)";
          setNotice(
            "Whisper could not transcribe this recording, so the browser's Web Speech preview text was used instead.",
          );
        }
        if (!segments.length) {
          // Audio exists but could not be transcribed (model failed, cancelled): never throw it away.
          const keepAudio =
            hasSessionRef.current && persistOkRef.current && (failedRef.current > 0 || cancelled);
          if (keepAudio) {
            lecture = { ...lecture, segments: [], transcript: "", hasAudio: true };
            setLecture(lecture);
            persist(lecture);
            void write(() =>
              updateSession(lecture!.id, { status: "complete", title: lecture!.title }),
            );
            void refreshAudioInfo(lecture);
            setNotice(
              cancelled
                ? 'Transcription was cancelled. Your audio is saved: use "Retry" to transcribe it.'
                : 'The audio is saved, but it could not be transcribed. Use "Retry" to try again.',
            );
          } else {
            setNotice("No speech was detected. Check the microphone and try again.");
            if (hasSessionRef.current) void write(() => deleteSession(lecture!.id));
            hasSessionRef.current = false;
          }
          return;
        }

        const hasAudio = hasSessionRef.current && persistOkRef.current;
        lecture = {
          ...lecture,
          segments,
          transcript: joinSegments(segments),
          sttEngine,
          hasAudio,
          durationSec: segments[segments.length - 1]?.end ?? lecture.durationSec,
        };
        segmentsRef.current = segments;
        setLecture(lecture);
        persist(lecture);
        if (hasSessionRef.current) {
          void write(() =>
            updateSession(lecture!.id, { status: "complete", title: lecture!.title }),
          );
        }
        void refreshAudioInfo(lecture);

        if (failedRef.current > 0) {
          setNotice(
            `${failedRef.current} part${failedRef.current > 1 ? "s" : ""} could not be transcribed. The audio is saved: use "Retry" to try again.`,
          );
        } else if (cancelled) {
          setNotice("Transcription was cancelled. You can resume it from the transcript panel.");
        }
        if (!cancelled && !opts.keepNotes) await generateNotes(lecture);
      } finally {
        setFinalizing(false);
        setPartsProgress(null);
      }
    },
    [generateNotes, refreshAudioInfo, setLecture, write],
  );

  // --- starting a session -------------------------------------------------------------------
  const beginSession = useCallback(
    async (source: "mic" | "file", fileName?: string) => {
      segmentsRef.current = [];
      failedRef.current = 0;
      cancelRef.current = false;
      liveCursorRef.current = { t: 0 };
      persistOkRef.current = true;
      setPersistenceOk(true);
      setNotice(null);
      setNotesMeta(null);
      setAudioInfo(null);
      const s = settings.current;
      const lecture = newLecture(
        s.audioLang,
        s.notesLang,
        `Whisper ${shortModelName(s.modelId)} (local)`,
        fileName ? { title: fileName.replace(/\.[^.]+$/, "") } : {},
      );
      setLecture(lecture);

      hasSessionRef.current = false;
      await write(async () => {
        await createSession({
          id: lecture.id,
          createdAt: lecture.createdAt,
          source,
          title: lecture.title,
          fileName,
          audioLanguage: s.audioLang,
          notesLanguage: s.notesLang,
          sttEngine: lecture.sttEngine,
        });
        hasSessionRef.current = true;
      });
      if (!hasSessionRef.current) {
        setNotice(
          "This browser cannot store audio locally, so this recording will not survive a crash or reload.",
        );
      } else {
        void requestPersistentStorage();
        void estimateStorage().then((e) => {
          if (e && e.quota - e.usage < LOW_STORAGE_BYTES) {
            toast.warning("Your device is low on storage; a long recording may not fit.");
          }
        });
      }
      return lecture;
    },
    [setLecture, write],
  );

  // --- live recording -----------------------------------------------------------------------
  const onPartial = useCallback(
    (chunk: RecordedChunk) => {
      const lecture = currentRef.current;
      if (!lecture || !hasSessionRef.current) return;
      void write(async () => {
        await putChunk({
          sessionId: lecture.id,
          index: chunk.index,
          blob: chunk.blob,
          mimeType: chunk.mimeType,
          complete: false,
          durationSec: chunk.durationSec,
          status: "pending",
        });
        await updateSession(lecture.id, {}); // heartbeat: tells other tabs this one is alive
      });
    },
    [write],
  );

  const onChunk = useCallback(
    (chunk: RecordedChunk) => {
      liveRef.current?.newChunk();
      const lecture = currentRef.current;
      if (!lecture) return;
      const record: ChunkInput = { ...chunk, status: "pending" };
      if (hasSessionRef.current) {
        void write(() => putChunk({ sessionId: lecture.id, complete: true, ...record }));
      }
      enqueue(() => processChunk(lecture.id, record, liveCursorRef.current));
    },
    [enqueue, processChunk, write],
  );

  const stopRecordingRef = useRef<(previewText?: string) => Promise<void>>(async () => {});
  const recorder = useRecorder({
    onChunk,
    onPartial,
    onEnded: () => {
      const previewText = (preview.finalText + " " + preview.interim).trim();
      preview.stop();
      void stopRecordingRef.current(previewText);
    },
  });

  const stopLive = useCallback(() => {
    liveRef.current?.stop();
    liveRef.current = null;
    tapRef.current?.stop();
    tapRef.current = null;
    setLive({ text: "" });
  }, []);

  useEffect(() => stopLive, [stopLive]);

  const refreshInputs = useCallback(async () => {
    setInputs(await listAudioInputs());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listAudioInputs().then((list) => {
        if (!cancelled) setInputs(list);
      });
    void load();
    const md = navigator.mediaDevices;
    md?.addEventListener?.("devicechange", load);
    return () => {
      cancelled = true;
      md?.removeEventListener?.("devicechange", load);
    };
  }, []);

  const startRecording = useCallback(async () => {
    const { sourceChoice: choice, micDeviceId: deviceId, liveEnabled: wantLive } = settings.current;
    const source: AudioSource =
      choice === "mic"
        ? { kind: "mic", deviceId: deviceId || undefined }
        : { kind: "tab", includeMic: choice === "tab-mic", micDeviceId: deviceId || undefined };

    await beginSession("mic");
    whisper.load();
    const stream = await recorder.start(source);
    if (!stream) {
      if (hasSessionRef.current && currentRef.current)
        void write(() => deleteSession(currentRef.current!.id));
      hasSessionRef.current = false;
      return;
    }
    void refreshInputs(); // device names are only available once access was granted

    // Live transcript: a second listener on the same stream, decoding the latest audio every few seconds.
    if (wantLive) {
      try {
        const tap = await startPcmTap(stream);
        tapRef.current = tap;
        const transcriber = new LiveTranscriber({
          ring: tap.ring,
          transcribe: (audio, language) => whisperRef.current.transcribe(audio, language),
          isBusy: () => pendingRef.current > 0 || whisperRef.current.status !== "ready",
          language: () => settings.current.audioLang,
          onUpdate: setLive,
          onError: (err) => reportError(err, { source: "live-transcript" }),
        });
        liveRef.current = transcriber;
        transcriber.start();
      } catch (err) {
        reportError(err, { source: "live-transcript-start" });
      }
    }
    // The browser's own speech recognition only hears the default microphone, so it is a
    // stopgap for microphone recordings while the Whisper model is still loading.
    if (choice === "mic") {
      preview.start(settings.current.audioLang === "auto" ? "en" : settings.current.audioLang);
    }
  }, [beginSession, preview, recorder, refreshInputs, whisper, write]);

  const stopRecording = useCallback(
    async (previewTextOverride?: string) => {
      const previewText = previewTextOverride ?? (preview.finalText + " " + preview.interim).trim();
      preview.stop();
      stopLive();
      await recorder.stop();
      await finalize({ previewText });
    },
    [finalize, preview, recorder, stopLive],
  );

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  // --- upload -------------------------------------------------------------------------------
  const uploadFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setFinalizing(true);
      const lecture = await beginSession("file", file.name);
      whisper.load();
      const record: ChunkInput = {
        index: 0,
        blob: file,
        mimeType: file.type || "audio/*",
        durationSec: 0,
        status: "pending",
      };
      if (hasSessionRef.current) {
        void write(() => putChunk({ sessionId: lecture.id, complete: true, ...record }));
      }
      enqueue(() => processChunk(lecture.id, record, liveCursorRef.current));
      await finalize();
    },
    [beginSession, enqueue, finalize, processChunk, whisper, write],
  );

  // --- resume / retry / re-transcribe / recovery ---------------------------------------------
  /** Run every unfinished chunk of a stored session, then rebuild the transcript from storage. */
  const resumeStored = useCallback(
    async (lectureId: string, opts: { keepNotes?: boolean } = {}) => {
      setFinalizing(true);
      cancelRef.current = false;
      failedRef.current = 0;
      try {
        const chunks = await getChunks(lectureId);
        // Only start the (large) model download if some audio actually still needs transcribing.
        if (chunks.some((c) => c.status === "pending" || c.status === "failed")) whisper.load();
        const cursor = { t: 0 };
        for (const chunk of chunks) {
          enqueue(() => processChunk(lectureId, chunk, cursor));
        }
        await queueRef.current;
        // Storage is the source of truth: rebuild so retried chunks slot into place.
        const fresh = await getChunks(lectureId);
        setSegments(fresh.flatMap((c) => c.segments ?? []));
      } catch (err) {
        reportError(err, { source: "resume" });
        toast.error("Could not read the stored audio.");
        setFinalizing(false);
        return;
      }
      await finalize({ keepNotes: opts.keepNotes ?? true });
    },
    [enqueue, finalize, processChunk, setSegments, whisper],
  );

  const retryFailed = useCallback(async () => {
    const lecture = currentRef.current;
    if (!lecture?.hasAudio) return;
    hasSessionRef.current = true;
    segmentsRef.current = lecture.segments ?? [];
    setNotice(null);
    await resumeStored(lecture.id);
    toast("Retry finished. Regenerate notes to include the new text.");
  }, [resumeStored]);

  const retranscribe = useCallback(async () => {
    const lecture = currentRef.current;
    if (!lecture?.hasAudio) return;
    hasSessionRef.current = true;
    try {
      const chunks = await getChunks(lecture.id);
      await Promise.all(
        chunks.map((c) =>
          patchChunk(lecture.id, c.index, { status: "pending", segments: [], error: undefined }),
        ),
      );
    } catch {
      toast.error("Could not read the stored audio.");
      return;
    }
    setNotice(null);
    setNotesMeta(null);
    patchCurrent({
      sttEngine: `Whisper ${shortModelName(settings.current.modelId)} (local)`,
      audioLanguage: settings.current.audioLang,
    });
    setSegments([]);
    await resumeStored(lecture.id);
    toast("Transcript replaced. Regenerate notes to use the new text.");
  }, [patchCurrent, resumeStored, setSegments]);

  const cancelNotes = useCallback(() => notesAbortRef.current?.abort(), []);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    whisper.cancel();
  }, [whisper]);

  const recoverSession = useCallback(
    async (sessionId: string) => {
      let session: AudioSession | undefined;
      try {
        session = await getSession(sessionId);
      } catch {
        session = undefined;
      }
      if (!session) {
        toast.error("That recording is no longer available.");
        void refreshUnfinished();
        return;
      }
      segmentsRef.current = [];
      liveCursorRef.current = { t: 0 };
      hasSessionRef.current = true;
      persistOkRef.current = true;
      setPersistenceOk(true);
      setNotice(null);
      setNotesMeta(null);
      setLecture(
        newLecture(session.audioLanguage, session.notesLanguage, session.sttEngine, {
          id: session.id,
          createdAt: session.createdAt,
          title: `Recovered: ${session.title}`,
          hasAudio: true,
        }),
      );
      setUnfinished((list) => list.filter((s) => s.id !== sessionId));
      await resumeStored(sessionId, { keepNotes: false });
    },
    [refreshUnfinished, resumeStored, setLecture],
  );

  const discardUnfinished = useCallback(async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
    } catch (err) {
      reportError(err, { source: "discard" });
    }
    setUnfinished((list) => list.filter((s) => s.id !== sessionId));
    toast("Unfinished recording deleted");
  }, []);

  // --- history ------------------------------------------------------------------------------
  const busy = pending > 0 || finalizing || generating;

  const selectLecture = useCallback(
    (l: Lecture) => {
      if (recorder.recording || busy) return;
      segmentsRef.current = l.segments ?? [];
      setLecture(l);
      setNotesMeta(l.notesEngine ? { engine: l.notesEngine, fallbackReasons: [] } : null);
      setNotice(null);
      setContext(l.context ?? "");
      void refreshAudioInfo(l);
    },
    [busy, recorder.recording, refreshAudioInfo, setLecture],
  );

  const removeLecture = useCallback(
    (l: Lecture) => {
      deleteLecture(l.id);
      if (l.hasAudio) void deleteSession(l.id).catch(() => {});
      if (currentRef.current?.id === l.id) {
        setLecture(null);
        segmentsRef.current = [];
        setNotesMeta(null);
        setAudioInfo(null);
      }
      toast("Lecture deleted");
    },
    [setLecture],
  );

  const deleteAudio = useCallback(async () => {
    const lecture = currentRef.current;
    if (!lecture) return;
    try {
      await deleteSession(lecture.id);
    } catch (err) {
      reportError(err, { source: "delete-audio" });
      toast.error("Could not delete the audio.");
      return;
    }
    const updated = { ...lecture, hasAudio: false };
    setLecture(updated);
    persist(updated);
    setAudioInfo(null);
    toast("Audio deleted. The transcript and notes are kept.");
  }, [setLecture]);

  // --- export -------------------------------------------------------------------------------
  const markdown = useMemo(() => (current ? lectureToMarkdown(current) : ""), [current]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Markdown copied");
    } catch {
      toast.error("Clipboard is not available in this browser context");
    }
  }, [markdown]);

  const downloadMarkdown = useCallback(() => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(current?.title ?? "lecture")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [current?.title, markdown]);

  const downloadAudio = useCallback(async () => {
    const lecture = currentRef.current;
    if (!lecture?.hasAudio) return;
    const toastId = "download-audio";
    toast.loading("Preparing WAV…", { id: toastId });
    try {
      await downloadLectureAudio(lecture.id, lecture.title);
      toast.success("Audio download started", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the audio", {
        id: toastId,
      });
    }
  }, []);

  // --- leave-page guard ---------------------------------------------------------------------
  const working = recorder.recording || busy;
  useEffect(() => {
    if (!working) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [working]);

  // --- playback -----------------------------------------------------------------------------
  const player = useAudioPlayer(current?.id ?? null, !!current?.hasAudio && !working);

  return {
    // data
    lectures,
    current,
    notesMeta,
    engines,
    notice,
    markdown,
    unfinished,
    audioInfo,
    persistenceOk,
    // settings
    sourceChoice,
    setSourceChoice,
    micDeviceId,
    setMicDeviceId,
    inputs,
    liveEnabled,
    setLiveEnabled,
    live,
    audioLang,
    setAudioLang,
    notesLang,
    setNotesLang,
    engineChoice,
    setEngineChoice,
    modelId,
    setModelChoice,
    // status
    busy,
    generating,
    notesProgress,
    context,
    setContext,
    pending,
    partsProgress,
    // engines
    whisper,
    preview,
    recorder,
    player,
    // actions
    startRecording,
    stopRecording: () => stopRecording(),
    uploadFile,
    generateNotes,
    selectLecture,
    removeLecture,
    copyMarkdown,
    downloadMarkdown,
    downloadAudio,
    cancel,
    cancelNotes,
    retryFailed,
    retranscribe,
    recoverSession,
    discardUnfinished,
    deleteAudio,
  };
}

export type LectureSession = ReturnType<typeof useLectureSession>;
