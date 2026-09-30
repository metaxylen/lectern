export type Definition = { term: string; definition: string };
export type ExamQuestion = { question: string; answer: string };

export type GlossaryEntry = { term: string; turkish: string };

/** A chapter of the lecture. `start` (seconds) lets the UI jump to it in the audio. */
export type Section = { title: string; summary: string; start?: number };

export type Flashcard = { front: string; back: string };

export type Notes = {
  title: string;
  summary: string;
  keyPoints: string[];
  definitions: Definition[];
  examQuestions: ExamQuestion[];
  glossary?: GlossaryEntry[];
  /** Chapters in lecture order. */
  sections?: Section[];
  flashcards?: Flashcard[];
  /** Things the lecturer said about exams, quizzes, homework or deadlines, plus "this is important" remarks. */
  examHints?: string[];
};

export type NotesEngine = "ollama" | "gemini" | "offline";
export type NotesEngineChoice = "auto" | NotesEngine;

export type NotesResult = {
  notes: Notes;
  engine: NotesEngine;
  model?: string;
  fallbackReasons: string[];
  /** Non-fatal quality notes, e.g. items removed because the transcript does not support them. */
  warnings?: string[];
  /** How long generation took, in milliseconds. */
  elapsedMs?: number;
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
  /** Optional course/topic hints the notes were generated with. */
  context?: string;
};
