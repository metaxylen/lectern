"use client";

import { useId, useState } from "react";
import { ChevronRight, Folder, FolderInput, FolderPlus, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lecture } from "@/lib/types";

export function HistoryList({
  lectures,
  activeId,
  activeProject,
  onOpenProject,
  onSelect,
  onDelete,
  onMove,
  disabled,
}: {
  lectures: Lecture[];
  activeId: string | null;
  activeProject: string | null;
  onOpenProject: (project: string) => void;
  onSelect: (l: Lecture) => void;
  onDelete: (l: Lecture) => void;
  onMove: (l: Lecture, project?: string) => void;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<string[]>([""]);
  const panelId = useId();
  const projects = [...new Set(lectures.flatMap((l) => (l.project ? [l.project] : [])))].sort();
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2" aria-labelledby="history-heading">
      <h2
        id="history-heading"
        className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        <History className="size-3.5" aria-hidden /> Past lectures
      </h2>
      {lectures.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing saved yet. Finished lectures stay in this browser.
        </p>
      ) : (
        <div
          className="flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-none lg:flex-1"
          aria-label="Past lectures"
        >
          {[...projects, ""].map((project, index) => (
            <div
              key={project}
              role="group"
              aria-label={project ? `Project ${project}` : "Ungrouped"}
            >
              <div
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium text-muted-foreground",
                  activeProject === project && "bg-primary/10 text-primary",
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Toggle ${project || "Ungrouped"} recordings`}
                  aria-expanded={expanded.includes(project)}
                  aria-controls={`${panelId}-${index}`}
                  onClick={() =>
                    setExpanded((value) =>
                      value.includes(project)
                        ? value.filter((name) => name !== project)
                        : [...value, project],
                    )
                  }
                >
                  <ChevronRight
                    className={cn(
                      "size-3.5 transition-transform",
                      expanded.includes(project) && "rotate-90",
                    )}
                    aria-hidden
                  />
                </Button>
                {project ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpenProject(project)}
                    aria-current={activeProject === project ? "page" : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-2 text-left outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <Folder className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{project}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2 px-1 py-2">
                    <Folder className="size-4" aria-hidden />
                    Ungrouped
                  </span>
                )}
              </div>
              <ul
                id={`${panelId}-${index}`}
                hidden={!expanded.includes(project)}
                aria-label={project ? `${project} recordings` : "Ungrouped recordings"}
              >
                {lectures
                  .filter((l) => (l.project ?? "") === project)
                  .map((l) => (
                    <li key={l.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onSelect(l)}
                        className={cn(
                          "relative w-full cursor-pointer rounded-lg px-3 py-2.5 pr-18 text-left transition-colors duration-200 hover:bg-sidebar-accent",
                          activeId === l.id &&
                            "bg-primary/12 ring-1 ring-primary/35 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
                        )}
                      >
                        <span className="line-clamp-2 text-sm font-medium">{l.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDate(l.createdAt)}
                          {l.notes ? "" : " · no notes yet"}
                        </span>
                      </button>
                      <Select
                        disabled={disabled}
                        value={l.project ? `project:${l.project}` : "ungrouped"}
                        onValueChange={(value) => {
                          if (value === null) return;
                          if (value === "new") {
                            const name = window.prompt("New project name")?.trim();
                            if (name) onMove(l, name);
                          } else onMove(l, value === "ungrouped" ? undefined : value.slice(8));
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={`Move ${l.title} to project`}
                          title="Move to project"
                          className="absolute top-1/2 right-10 size-7 -translate-y-1/2 justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground hover:bg-sidebar-accent dark:bg-transparent dark:hover:bg-sidebar-accent [&>svg:last-child]:hidden"
                        >
                          <FolderInput className="size-4" aria-hidden />
                        </SelectTrigger>
                        <SelectContent
                          side="right"
                          align="start"
                          sideOffset={8}
                          alignItemWithTrigger={false}
                          className="w-56 max-w-[calc(100vw-1rem)] rounded-xl border border-white/10 bg-popover p-1.5 shadow-xl"
                        >
                          <SelectGroup className="p-0">
                            <SelectLabel className="px-2 py-2 text-xs">Move to project</SelectLabel>
                            <SelectItem
                              value="ungrouped"
                              className="cursor-pointer rounded-lg py-2 pl-2"
                            >
                              <Folder className="size-4 text-muted-foreground" aria-hidden />
                              Ungrouped
                            </SelectItem>
                            {projects.map((name) => (
                              <SelectItem
                                key={name}
                                value={`project:${name}`}
                                className="cursor-pointer rounded-lg py-2 pl-2 [&>span]:min-w-0"
                              >
                                <Folder className="size-4 text-muted-foreground" aria-hidden />
                                <span className="truncate">{name}</span>
                              </SelectItem>
                            ))}
                            <SelectSeparator className="mx-1 my-1.5" />
                            <SelectItem
                              value="new"
                              className="cursor-pointer rounded-lg py-2 pl-2 text-primary"
                            >
                              <FolderPlus className="size-4" aria-hidden />
                              New project…
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${l.title}`}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-70 hover:opacity-100"
                        onClick={() => onDelete(l)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
