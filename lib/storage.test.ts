// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY, deleteLecture, resetStorageCache, saveLecture } from "./storage";
import type { Lecture } from "./types";

const make = (id: string, createdAt: number): Lecture => ({
  id,
  createdAt,
  title: id,
  transcript: "t",
  notes: null,
  notesLanguage: "en",
  audioLanguage: "auto",
  sttEngine: "test",
  notesEngine: null,
});

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Lecture[];

beforeEach(() => {
  localStorage.clear();
  resetStorageCache();
});

describe("storage", () => {
  it("saves newest first and updates in place", () => {
    saveLecture(make("old", 1));
    saveLecture(make("new", 2));
    expect(stored().map((l) => l.id)).toEqual(["new", "old"]);

    saveLecture({ ...make("old", 1), title: "renamed" });
    expect(stored().find((l) => l.id === "old")?.title).toBe("renamed");
    expect(stored()).toHaveLength(2);
  });

  it("deletes", () => {
    saveLecture(make("a", 1));
    expect(deleteLecture("a")).toBe(true);
    expect(stored()).toEqual([]);
  });

  it("ignores corrupt JSON and malformed entries", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    resetStorageCache();
    expect(saveLecture(make("a", 1))).toBe(true);
    expect(stored().map((l) => l.id)).toEqual(["a"]);

    localStorage.setItem(STORAGE_KEY, JSON.stringify([make("ok", 1), { id: "bad" }]));
    resetStorageCache();
    saveLecture(make("b", 2));
    expect(stored().map((l) => l.id)).toEqual(["b", "ok"]);
  });

  it("reports failure when the browser refuses the write, but keeps working in memory", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(saveLecture(make("a", 1))).toBe(false);
  });
});
