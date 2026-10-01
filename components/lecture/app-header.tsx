import Image from "next/image";

export function AppHeader() {
  return (
    <header className="flex items-center gap-3">
      <Image src="/logo.svg" alt="" width={40} height={40} priority className="rounded-xl" />
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">Lectern</h1>
        <p className="text-xs leading-snug text-muted-foreground">
          Local transcription and study notes
        </p>
      </div>
    </header>
  );
}
