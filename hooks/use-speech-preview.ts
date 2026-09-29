"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Rec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};
type RecResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecCtor = new () => Rec;

const BCP47: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
  fr: "fr-FR",
  es: "es-ES",
  ar: "ar-SA",
  ru: "ru-RU",
};

function getCtor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechPreview() {
  const supported = useSyncExternalStore(
    () => () => {},
    () => getCtor() !== null,
    () => false,
  );
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Rec | null>(null);
  const activeRef = useRef(false);

  const start = useCallback((language: string) => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setFinalText("");
    setInterim("");
    setError(null);
    const rec = new Ctor();
    rec.lang = BCP47[language] ?? "tr-TR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = "";
      let finals = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + " ";
        else interimText += r[0].transcript;
      }
      if (finals) setFinalText((t) => (t + finals).replace(/\s+/g, " "));
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(`Live preview stopped (${e.error}).`);
      activeRef.current = false;
    };
    rec.onend = () => {
      if (activeRef.current) {
        try {
          rec.start();
        } catch {
          activeRef.current = false;
        }
      }
    };
    activeRef.current = true;
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      activeRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      // already stopped
    }
    recRef.current = null;
    setInterim("");
  }, []);

  useEffect(() => stop, [stop]);

  return { supported, finalText, interim, error, start, stop };
}
