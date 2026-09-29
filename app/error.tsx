"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/monitoring";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: "app/error.tsx" });
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        The page hit an unexpected error. Your saved lectures are stored in this browser and are not
        affected.
      </p>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <Button onClick={() => retry()}>Try again</Button>
    </main>
  );
}
