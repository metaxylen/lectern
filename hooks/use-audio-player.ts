"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getChunks } from "@/lib/audio-store";

type Track = { start: number; duration: number; blob: Blob };

/** Which track contains `time`, clamped into range. */
export function trackAt(tracks: { start: number; duration: number }[], time: number): number {
  if (!tracks.length) return -1;
  for (let i = tracks.length - 1; i >= 0; i--) {
    if (time >= tracks[i].start) return i;
  }
  return 0;
}

/**
 * Plays a lecture's stored audio. A recording is many standalone chunks, so this plays them back to
 * back and maps between the lecture timeline (seconds) and (chunk, offset).
 */
export function useAudioPlayer(lectureId: string | null, enabled: boolean) {
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const indexRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  const loadTrack = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      const track = tracksRef.current[index];
      if (!audio || !track) return false;
      revokeUrl();
      urlRef.current = URL.createObjectURL(track.blob);
      indexRef.current = index;
      audio.src = urlRef.current;
      return true;
    },
    [revokeUrl],
  );

  useEffect(() => {
    tracksRef.current = [];
    if (!lectureId || !enabled) return;

    let cancelled = false;
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTime = () => {
      const t = tracksRef.current[indexRef.current];
      if (t) setCurrentTime(t.start + audio.currentTime);
    };
    const onEnded = () => {
      const next = indexRef.current + 1;
      if (loadTrack(next)) void audio.play().catch(() => {});
      else setPlaying(false);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("error", () => setError("This audio could not be played."));

    getChunks(lectureId)
      .then((chunks) => {
        if (cancelled) return;
        let start = 0;
        tracksRef.current = chunks.map((c) => {
          const track = { start, duration: c.durationSec, blob: c.blob };
          start += c.durationSec;
          return track;
        });
        setDuration(start);
        if (tracksRef.current.length) {
          loadTrack(0);
          setReady(true);
        }
      })
      .catch(() => !cancelled && setError("Could not read the stored audio."));

    return () => {
      cancelled = true;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      revokeUrl();
      // Reset for whichever lecture comes next (state changes belong in the teardown, not the body).
      setReady(false);
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
    };
  }, [lectureId, enabled, loadTrack, revokeUrl]);

  const seek = useCallback(
    async (time: number, autoplay = true) => {
      const audio = audioRef.current;
      const tracks = tracksRef.current;
      const i = trackAt(tracks, time);
      if (!audio || i < 0) return;
      if (i !== indexRef.current || !audio.src) loadTrack(i);
      const offset = Math.max(0, time - tracks[i].start);
      const apply = () => {
        audio.currentTime = offset;
        setCurrentTime(tracks[i].start + offset);
      };
      if (audio.readyState >= 1) apply();
      else audio.addEventListener("loadedmetadata", apply, { once: true });
      if (autoplay) await audio.play().catch(() => {});
    },
    [loadTrack],
  );

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => {});
    else audio.pause();
  }, []);

  return { ready, playing, currentTime, duration, error, seek, toggle };
}
