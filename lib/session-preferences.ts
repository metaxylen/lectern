"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  DEFAULT_NOTES_LANGUAGE,
  DEFAULT_SPEECH_LANGUAGE,
  NOTES_OPTIONS,
  SPEECH_OPTIONS,
} from "./languages";
import { MODEL_NATIVE, WHISPER_MODELS } from "./stt/models";

const preferencesSchema = z.object({
  audioLang: z
    .string()
    .refine((value) => SPEECH_OPTIONS.some((option) => option.value === value))
    .catch(DEFAULT_SPEECH_LANGUAGE),
  notesLang: z
    .string()
    .refine((value) => NOTES_OPTIONS.some((option) => option.value === value))
    .catch(DEFAULT_NOTES_LANGUAGE),
  modelId: z
    .string()
    .refine((value) => WHISPER_MODELS.some((model) => model.id === value))
    .catch(MODEL_NATIVE),
  engineChoice: z.enum(["auto", "ollama", "openai", "gemini", "offline"]).catch("auto"),
  liveEnabled: z.boolean().catch(true),
});

export type SessionPreferences = z.infer<typeof preferencesSchema>;
export const SESSION_PREFERENCES_KEY = "stt.session-options.v1";
export const DEFAULT_SESSION_PREFERENCES = preferencesSchema.parse({});

const listeners = new Set<() => void>();
let cache: SessionPreferences | null = null;

export function readSessionPreferences(): SessionPreferences {
  if (cache) return cache;
  try {
    const parsed = preferencesSchema.safeParse(
      JSON.parse(localStorage.getItem(SESSION_PREFERENCES_KEY) ?? "{}"),
    );
    cache = parsed.success ? parsed.data : DEFAULT_SESSION_PREFERENCES;
  } catch {
    cache = DEFAULT_SESSION_PREFERENCES;
  }
  return cache;
}

/** Save only on explicit changes so hydration cannot overwrite the saved choices. */
export function saveSessionPreference<K extends keyof SessionPreferences>(
  key: K,
  value: SessionPreferences[K],
): boolean {
  cache = { ...readSessionPreferences(), [key]: value };
  let persisted = true;
  try {
    localStorage.setItem(SESSION_PREFERENCES_KEY, JSON.stringify(cache));
  } catch {
    persisted = false;
  }
  listeners.forEach((listener) => listener());
  return persisted;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_PREFERENCES_KEY || event.key === null) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSessionPreferences(): SessionPreferences {
  return useSyncExternalStore(subscribe, readSessionPreferences, () => DEFAULT_SESSION_PREFERENCES);
}
