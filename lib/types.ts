export type Definition = { term: string; definition: string };
export type ExamQuestion = { question: string; answer: string };

export type GlossaryEntry = { term: string; turkish: string };

export type Notes = {
  title: string;
  summary: string;
  keyPoints: string[];
  definitions: Definition[];
  examQuestions: ExamQuestion[];
  glossary?: GlossaryEntry[];
};

export type NotesEngine = "ollama" | "gemini" | "offline";
export type NotesEngineChoice = "auto" | NotesEngine;

export type NotesResult = {
  notes: Notes;
  engine: NotesEngine;
  model?: string;
  fallbackReasons: string[];
};

export type EngineStatus = {
  ollama: { reachable: boolean; host: string; models: string[]; selected: string | null };
  gemini: { configured: boolean; model: string };
};

export type Segment = {
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  text: string;
  /** Language Whisper transcribed this segment in, e.g. "en" or "tr". */
  language?: string;
};

export type Lecture = {
  id: string;
  createdAt: number;
  title: string;
  transcript: string;
  notes: Notes | null;
  notesLanguage: string;
  notesGlossary?: boolean;
  audioLanguage: string;
  sttEngine: string;
  notesEngine: NotesEngine | null;
  durationSec?: number;
  /** Timestamped transcript; `transcript` is always the plain-text join of these. */
  segments?: Segment[];
  /** Original audio is stored on this device (IndexedDB) under the lecture id. */
  hasAudio?: boolean;
};
