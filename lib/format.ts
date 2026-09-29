const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" });

export function formatDate(ms: number): string {
  return dateFormat.format(ms);
}

/** 75 -> "01:15" */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
