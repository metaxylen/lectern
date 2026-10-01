"use client";

import { HistoryList } from "@/components/history-list";
import { CaptureCard } from "@/components/lecture/capture-card";
import { AppHeader } from "@/components/lecture/app-header";
import { EngineStrip } from "@/components/lecture/engine-strip";
import { NotesSection } from "@/components/lecture/notes-section";
import { RecoveryBanner } from "@/components/lecture/recovery-banner";
import { StoragePanel } from "@/components/lecture/storage-panel";
import { TranscriptPanel } from "@/components/lecture/transcript-panel";
import { useLectureSession } from "@/hooks/use-lecture-session";

export function LectureApp() {
  const session = useLectureSession();

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <a
        href="#workspace"
        className="sr-only bg-primary text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2"
      >
        Skip to workspace
      </a>

      <div className="contents lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-72 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-white/10 lg:bg-sidebar lg:backdrop-blur-xl">
        <header className="border-b border-white/10 bg-sidebar px-4 py-4 backdrop-blur-xl lg:border-b-0 lg:px-5 lg:pt-6 lg:pb-4">
          <AppHeader />
        </header>
        <aside className="order-last flex flex-col gap-4 border-t border-white/10 bg-sidebar px-4 py-4 backdrop-blur-xl lg:order-none lg:flex-1 lg:border-t-0 lg:px-5 lg:pb-6">
          <HistoryList
            lectures={session.lectures}
            activeId={session.current?.id ?? null}
            onSelect={session.selectLecture}
            onDelete={session.removeLecture}
          />
          <StoragePanel session={session} />
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-white/10 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <EngineStrip
            whisper={session.whisper}
            modelId={session.modelId}
            engines={session.engines}
            previewSupported={session.preview.supported}
          />
        </div>

        <div
          id="workspace"
          className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:gap-5"
        >
          <RecoveryBanner session={session} />

          <main className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <CaptureCard session={session} />
            <div className="grid min-w-0 gap-4 xl:grid-cols-2 xl:items-start">
              <TranscriptPanel session={session} />
              <div className="flex min-w-0 flex-col gap-4">
                <NotesSection session={session} />
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
