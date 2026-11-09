"use client";

import { useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, FileAudio, Folder, Mic, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LectureSession } from "@/hooks/use-lecture-session";
import { formatDate } from "@/lib/format";

export function ProjectWorkspace({ session }: { session: LectureSession }) {
  const project = session.activeProject!;
  const recordings = session.lectures.filter((lecture) => lecture.project === project);
  const locked = session.busy || session.recorder.recording;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  return (
    <>
      <header className="rounded-2xl border border-white/10 bg-card p-5 sm:p-7">
        <Button
          variant="ghost"
          size="sm"
          className="mb-5 -ml-2 text-muted-foreground"
          disabled={locked}
          onClick={() => session.openProject(null)}
        >
          <ArrowLeft /> All recordings
        </Button>
        <div className="flex flex-col items-stretch justify-between gap-5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:flex-1">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
              <Folder className="size-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                Project
              </p>
              {editing ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (session.renameProject(name)) setEditing(false);
                  }}
                >
                  <input
                    aria-label="Project name"
                    autoFocus
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditing(false);
                    }}
                    className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-lg outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    aria-label="Save project name"
                    disabled={locked || !name.trim()}
                  >
                    <Check />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cancel project rename"
                    onClick={() => setEditing(false)}
                  >
                    <X />
                  </Button>
                </form>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="min-w-0 text-2xl font-semibold sm:text-3xl">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => session.openProject(project)}
                      className="max-w-full truncate rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Open project history"
                    >
                      {project}
                    </button>
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Rename project"
                    disabled={locked}
                    onClick={() => {
                      setName(project);
                      setEditing(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                </div>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {recordings.length} recordings · New recordings save to this project
              </p>
            </div>
          </div>
          <Button
            variant="cta"
            size="lg"
            className="self-start sm:self-auto"
            disabled={locked}
            onClick={() => session.openProject(project, false)}
          >
            <Mic /> New recording
          </Button>
        </div>
      </header>
      {session.projectHome && (
        <section aria-label="Project history" className="flex flex-col gap-3">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">History</h2>
          {recordings.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              No recordings yet. Start a new recording in this project.
            </p>
          )}
          {recordings.map((lecture) => (
            <button
              type="button"
              key={lecture.id}
              onClick={() => session.selectLecture(lecture)}
              className="group flex w-full items-center gap-4 rounded-xl border border-white/10 bg-card p-4 text-left transition-colors outline-none hover:border-primary/35 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            >
              <FileAudio className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-medium">{lecture.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDate(lecture.createdAt)} · {lecture.notes ? "Notes ready" : "No notes yet"}
                </p>
              </div>
              <ArrowUpRight
                className="size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                aria-hidden
              />
            </button>
          ))}
        </section>
      )}
    </>
  );
}
