"use client";

import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lecture } from "@/lib/types";

export function HistoryList({
  lectures,
  activeId,
  onSelect,
  onDelete,
}: {
  lectures: Lecture[];
  activeId: string | null;
  onSelect: (l: Lecture) => void;
  onDelete: (l: Lecture) => void;
}) {
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
        <ul
          className="flex max-h-64 flex-col gap-1 overflow-y-auto lg:max-h-none lg:flex-1"
          aria-label="Past lectures"
        >
          {lectures.map((l) => (
            <li key={l.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(l)}
                className={cn(
                  "relative w-full cursor-pointer rounded-lg px-3 py-2.5 pr-10 text-left transition-colors duration-200 hover:bg-sidebar-accent",
                  activeId === l.id &&
                    "bg-primary/12 ring-1 ring-primary/35 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
                )}
              >
                <span className="line-clamp-2 text-sm font-medium">{l.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(l.createdAt)}
                  {l.notes ? "" : " · no notes yet"}
                </span>
              </button>
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
      )}
    </section>
  );
}
