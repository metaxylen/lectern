"use client";

import { HistoryList } from "@/components/history-list";
import { AppHeader } from "@/components/lecture/app-header";
import { NotesSection } from "@/components/lecture/notes-section";
import { RecorderPanel } from "@/components/lecture/recorder-panel";
import { RecoveryBanner } from "@/components/lecture/recovery-banner";
import { SessionSetup } from "@/components/lecture/session-setup";
import { StoragePanel } from "@/components/lecture/storage-panel";
import { TranscriptPanel } from "@/components/lecture/transcript-panel";
import { useLectureSession } from "@/hooks/use-lecture-session";

export function LectureApp() {
  const session = useLectureSession();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <AppHeader session={session} />
      <RecoveryBanner session={session} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-w-0 flex-col gap-6">
          <SessionSetup session={session} />
          <RecorderPanel session={session} />
          <TranscriptPanel session={session} />
          <NotesSection session={session} />
        </main>

        <aside className="min-w-0">
          <div className="flex flex-col gap-6 lg:sticky lg:top-6">
            <HistoryList
              lectures={session.lectures}
              activeId={session.current?.id ?? null}
              onSelect={session.selectLecture}
              onDelete={session.removeLecture}
            />
            <StoragePanel session={session} />
          </div>
        </aside>
      </div>
    </div>
  );
}
