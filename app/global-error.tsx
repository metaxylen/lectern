"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/monitoring";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: "app/global-error.tsx" });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "1.5rem",
          background: "#070F0E",
          color: "#F0FDFA",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, marginBottom: "1rem" }}>
            The app failed to load. Your saved lectures in this browser are not affected.
          </p>
          <button onClick={() => retry()} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
