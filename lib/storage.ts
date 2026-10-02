"use client";

import { useSyncExternalStore } from "react";
import { reportError } from "./monitoring";
import { parseLectures } from "./schemas";
import type { Lecture } from "./types";

export const STORAGE_KEY = "stt.lectures.v1";
const EMPTY: Lecture[] = [];
const listeners = new Set<() => void>();
let cache: Lecture[] | null = null;

function read(): Lecture[] {
  if (cache) return cache;
  try {
    const { lectures, dropped } = parseLectures(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"),
    );
    if (dropped > 0)
      reportError(new Error(`Dropped ${dropped} malformed stored lecture(s)`), {
        source: "storage",
      });
    cache = lectures;
  } catch {
    cache = [];
  }
  return cache;
}

/** Returns false when the browser refused the write (quota exceeded, private mode, ...). */
function write(next: Lecture[]): boolean {
  cache = next;
  let persisted = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    persisted = false;
    reportError(err, { source: "storage.write", lectures: next.length });
  }
  listeners.forEach((l) => l());
  return persisted;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLectures(): Lecture[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Insert or update a lecture. Returns whether it was durably persisted. */
export function saveLecture(lecture: Lecture): boolean {
  const all = read();
  const exists = all.some((l) => l.id === lecture.id);
  const next = exists ? all.map((l) => (l.id === lecture.id ? lecture : l)) : [lecture, ...all];
  return write(next.sort((a, b) => b.createdAt - a.createdAt));
}

export function deleteLecture(id: string): boolean {
  return write(read().filter((l) => l.id !== id));
}

/** Read lectures without subscribing (export / import). */
export function readLectures(): Lecture[] {
  return [...read()];
}

/** Replace the full lecture list (backup import). */
export function replaceAllLectures(lectures: Lecture[]): boolean {
  return write([...lectures].sort((a, b) => b.createdAt - a.createdAt));
}

/** Test helper: forget the in-memory copy so the next read hits localStorage again. */
export function resetStorageCache() {
  cache = null;
}
