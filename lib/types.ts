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
};
