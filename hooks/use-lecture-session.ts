"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  MODEL_WITHOUT_WEBGPU,
  MODEL_WITH_WEBGPU,
  hasWebGpu,
  useWhisper,
} from "@/hooks/use-whisper";
import { useRecorder } from "@/hooks/use-recorder";
import { useSpeechPreview } from "@/hooks/use-speech-preview";
import { DEFAULT_NOTES_LANGUAGE, DEFAULT_SPEECH_LANGUAGE } from "@/lib/languages";
import { newLecture } from "@/lib/lecture";
import { lectureToMarkdown, slugify } from "@/lib/markdown";
import { reportError } from "@/lib/monitoring";
import { requestNotes } from "@/lib/notes-client";
import { deleteLecture, saveLecture, useLectures } from "@/lib/storage";
import { decodeToMono16k, isMostlySilent, splitAudio } from "@/lib/stt/audio";
import type { EngineStatus, Lecture, NotesEngineChoice, NotesResult } from "@/lib/types";
import { parseNotesLanguage } from "@/lib/languages";

export type NotesMeta = Pick<NotesResult, "engine" | "model" | "fallbackReasons">;

const STORAGE_FULL_MESSAGE =
  "Could not save to this browser (storage is full or blocked). Download the Markdown to keep a copy.";

function persist(lecture: Lecture) {
  if (!saveLecture(lecture)) toast.error(STORAGE_FULL_MESSAGE);
}

/**
 * Owns the whole record → transcribe → notes flow and all of its state, so the UI components
 * stay presentational. Refs mirror state that async callbacks need to read without going stale.
 */
export function useLectureSession() {
  const lectures = useLectures();

  // --- settings -----------------------------------------------------------------------------
  const [audioLang, setAudioLang] = useState(DEFAULT_SPEECH_LANGUAGE);
  const [notesLang, setNotesLang] = useState(DEFAULT_NOTES_LANGUAGE);
  const [engineChoice, setEngineChoice] = useState<NotesEngineChoice>("auto");
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const webGpu = useSyncExternalStore(
    () => () => {},
    hasWebGpu,
    () => false,
  );
  const modelId = modelChoice ?? (webGpu ? MODEL_WITH_WEBGPU : MODEL_WITHOUT_WEBGPU);

  // --- session state ------------------------------------------------------------------------
  const [engines, setEngines] = useState<EngineStatus | null>(null);
  const [current, setCurrent] = useState<Lecture | null>(null);
  const [notesMeta, setNotesMeta] = useState<NotesMeta | null>(null);
  const [pending, setPending] = useState(0);
  const [partsProgress, setPartsProgress] = useState<{ done: number; total: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const whisper = useWhisper(modelId);
  const preview = useSpeechPreview();

  const segmentsRef = useRef<string[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const currentRef = useRef<Lecture | null>(null);
  const failedChunks = useRef(0);
  const settings = useRef({ audioLang, notesLang, engineChoice });

  useEffect(() => {
    settings.current = { audioLang, notesLang, engineChoice };
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: EngineStatus | null) => s && setEngines(s))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // --- helpers ------------------------------------------------------------------------------
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

  const enqueue = useCallback((job: () => Promise<void>) => {
    setPending((p) => p + 1);
    queueRef.current = queueRef.current
      .then(job)
      .catch((err) => {
        failedChunks.current += 1;
        reportError(err, { source: "transcription" });
        toast.error(`Transcription failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => setPending((p) => p - 1));
  }, []);

  const pushSegment = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      segmentsRef.current = [...segmentsRef.current, text.trim()];
      patchCurrent({ transcript: segmentsRef.current.join(" ") });
    },
    [patchCurrent],
  );

  // --- notes --------------------------------------------------------------------------------
  const generateNotes = useCallback(
    async (lecture: Lecture) => {
      if (!lecture.transcript.trim()) return;
      setGenerating(true);
      try {
        const { notesLang: nl, engineChoice: engine } = settings.current;
        const result = await requestNotes(lecture.transcript, nl, engine);
        const parsed = parseNotesLanguage(nl);
        const updated: Lecture = {
          ...lecture,
          title: result.notes.title || lecture.title,
          notes: result.notes,
          notesLanguage: parsed.language,
          notesGlossary: parsed.glossary,
          notesEngine: result.engine,
        };
        persist(updated);
        if (currentRef.current?.id === updated.id) {
          setLecture(updated);
          setNotesMeta({
            engine: result.engine,
            model: result.model,
            fallbackReasons: result.fallbackReasons,
          });
        }
        toast.success("Notes are ready");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not generate notes");
      } finally {
        setGenerating(false);
      }
    },
    [setLecture],
  );

  const finalize = useCallback(
    async (usePreviewText?: string) => {
      setFinalizing(true);
      try {
        await queueRef.current;
        let lecture = currentRef.current;
        if (!lecture) return;
        let transcript = segmentsRef.current.join(" ").trim();
        if (!transcript && usePreviewText?.trim()) {
          transcript = usePreviewText.trim();
          segmentsRef.current = [transcript];
          lecture = { ...lecture, sttEngine: "Web Speech API (fallback)" };
          setNotice(
            "Whisper could not transcribe this recording, so the browser's Web Speech preview text was used instead.",
          );
        }
        if (!transcript) {
          setNotice("No speech was detected. Check the microphone and try again.");
          return;
        }
        lecture = { ...lecture, transcript };
        setLecture(lecture);
        persist(lecture);
        await generateNotes(lecture);
      } finally {
        setFinalizing(false);
        setPartsProgress(null);
      }
    },
    [generateNotes, setLecture],
  );

  // --- recording / upload -------------------------------------------------------------------
  const onChunk = useCallback(
    (blob: Blob) => {
      enqueue(async () => {
        const samples = await decodeToMono16k(blob);
        if (isMostlySilent(samples)) return;
        const lang = settings.current.audioLang;
        pushSegment(await whisper.transcribe(samples, lang === "auto" ? undefined : lang));
      });
    },
    [enqueue, pushSegment, whisper],
  );

  const recorder = useRecorder(onChunk);

  const resetSession = useCallback(() => {
    segmentsRef.current = [];
    failedChunks.current = 0;
    setNotice(null);
    setNotesMeta(null);
    setLecture(
      newLecture(
        settings.current.audioLang,
        settings.current.notesLang,
        `Whisper ${modelId.split("/").pop()} (local)`,
      ),
    );
  }, [modelId, setLecture]);

  const startRecording = useCallback(async () => {
    resetSession();
    whisper.load();
    const ok = await recorder.start();
    if (!ok) return;
    preview.start(settings.current.audioLang === "auto" ? "en" : settings.current.audioLang);
  }, [preview, recorder, resetSession, whisper]);

  const stopRecording = useCallback(async () => {
    preview.stop();
    const previewText = (preview.finalText + " " + preview.interim).trim();
    await recorder.stop();
    await finalize(previewText);
  }, [finalize, preview, recorder]);

  const uploadFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      resetSession();
      whisper.load();
      setFinalizing(true);
      enqueue(async () => {
        let samples: Float32Array;
        try {
          samples = await decodeToMono16k(file);
        } catch {
          throw new Error("Could not decode this audio file. Try mp3, wav, m4a, ogg or webm.");
        }
        const parts = splitAudio(samples);
        setPartsProgress({ done: 0, total: parts.length });
        const lang = settings.current.audioLang;
        for (let i = 0; i < parts.length; i++) {
          if (!isMostlySilent(parts[i])) {
            pushSegment(await whisper.transcribe(parts[i], lang === "auto" ? undefined : lang));
          }
          setPartsProgress({ done: i + 1, total: parts.length });
        }
      });
      patchCurrent({ title: file.name.replace(/\.[^.]+$/, "") });
      await finalize();
    },
    [enqueue, finalize, patchCurrent, pushSegment, resetSession, whisper],
  );

  // --- history ------------------------------------------------------------------------------
  const busy = pending > 0 || finalizing || generating;

  const selectLecture = useCallback(
    (l: Lecture) => {
      if (recorder.recording || busy) return;
      segmentsRef.current = l.transcript ? [l.transcript] : [];
      setLecture(l);
      setNotesMeta(l.notesEngine ? { engine: l.notesEngine, fallbackReasons: [] } : null);
      setNotice(null);
    },
    [busy, recorder.recording, setLecture],
  );

  const removeLecture = useCallback(
    (l: Lecture) => {
      deleteLecture(l.id);
      if (currentRef.current?.id === l.id) {
        setLecture(null);
        segmentsRef.current = [];
        setNotesMeta(null);
      }
      toast("Lecture deleted");
    },
    [setLecture],
  );

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

  return {
    // data
    lectures,
    current,
    notesMeta,
    engines,
    notice,
    markdown,
    // settings
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
    pending,
    partsProgress,
    // engines
    whisper,
    preview,
    recorder,
    // actions
    startRecording,
    stopRecording,
    uploadFile,
    generateNotes,
    selectLecture,
    removeLecture,
    copyMarkdown,
    downloadMarkdown,
  };
}

export type LectureSession = ReturnType<typeof useLectureSession>;
