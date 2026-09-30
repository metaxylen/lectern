/**
 * Where the audio comes from. A browser cannot tap "everything the computer plays" on its own:
 *  - microphone: any input device, including virtual ones (BlackHole, Loopback) that carry system audio;
 *  - tab / screen share: the audio of one browser tab or, on Windows and ChromeOS, of the whole system.
 *    macOS only offers tab audio (and only in Chrome/Edge), which is why system-wide capture on a Mac
 *    goes through a virtual input device.
 */
export type AudioSource =
  { kind: "mic"; deviceId?: string } | { kind: "tab"; includeMic: boolean; micDeviceId?: string };

export type AudioSourceErrorCode =
  "unsupported" | "denied" | "cancelled" | "no-audio" | "unavailable";

export class AudioSourceError extends Error {
  constructor(
    readonly code: AudioSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AudioSourceError";
  }
}

export type OpenedAudio = {
  stream: MediaStream;
  /** Human-readable description for the UI, e.g. "Microphone" or "Shared tab audio". */
  label: string;
  /** Release every device, track and audio node. Safe to call twice. */
  close: () => void;
  /** Called once when the source goes away by itself (unplugged, "Stop sharing", tab closed). */
  onEnded: (cb: () => void) => void;
};

/** The browser pieces we use, injectable so the logic can be tested without a browser. */
export type CaptureDeps = {
  mediaDevices: Pick<MediaDevices, "getUserMedia"> & {
    getDisplayMedia?: (constraints?: unknown) => Promise<MediaStream>;
  };
  createAudioContext: () => AudioContext;
};

function browserDeps(): CaptureDeps {
  const Ctx: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return {
    mediaDevices: navigator.mediaDevices as CaptureDeps["mediaDevices"],
    createAudioContext: () => new Ctx(),
  };
}

export function isTabCaptureSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
}

const MIC_CONSTRAINTS = (deviceId?: string): MediaStreamConstraints => ({
  audio: {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
  },
});

function micError(err: unknown): AudioSourceError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new AudioSourceError(
      "denied",
      "Microphone permission was denied. Allow it in the browser and try again.",
    );
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new AudioSourceError(
      "unavailable",
      "That audio input is not available. Pick another one or plug it in.",
    );
  }
  return new AudioSourceError(
    "unavailable",
    "Could not open the microphone. Is one connected? (Needs HTTPS or localhost.)",
  );
}

async function openMic(deviceId: string | undefined, deps: CaptureDeps): Promise<OpenedAudio> {
  if (!deps.mediaDevices?.getUserMedia) {
    throw new AudioSourceError(
      "unsupported",
      "This browser does not support microphone recording.",
    );
  }
  let stream: MediaStream;
  try {
    stream = await deps.mediaDevices.getUserMedia(MIC_CONSTRAINTS(deviceId));
  } catch (err) {
    throw micError(err);
  }
  return wrap(stream, deviceId ? "Selected audio input" : "Microphone", () => {});
}

function wrap(stream: MediaStream, label: string, extraClose: () => void): OpenedAudio {
  let closed = false;
  let listener: (() => void) | null = null;
  let fired = false;
  const fire = () => {
    if (fired || closed) return;
    fired = true;
    listener?.();
  };
  stream.getAudioTracks().forEach((t) => t.addEventListener("ended", fire));
  return {
    stream,
    label,
    onEnded(cb) {
      listener = cb;
    },
    close() {
      if (closed) return;
      closed = true;
      stream.getTracks().forEach((t) => t.stop());
      extraClose();
    },
  };
}

async function openTab(
  source: Extract<AudioSource, { kind: "tab" }>,
  deps: CaptureDeps,
): Promise<OpenedAudio> {
  const getDisplayMedia = deps.mediaDevices?.getDisplayMedia?.bind(deps.mediaDevices);
  if (!getDisplayMedia) {
    throw new AudioSourceError(
      "unsupported",
      "This browser cannot capture tab audio. Use Chrome or Edge, or pick a virtual audio input instead.",
    );
  }

  let display: MediaStream;
  try {
    // Video is required by the API even though we only want the sound. Processing is turned off:
    // noise suppression would treat music and remote speakers as noise.
    display = await getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: "include",
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "AbortError") {
      throw new AudioSourceError("cancelled", "Sharing was cancelled.");
    }
    throw new AudioSourceError("unavailable", "Could not start screen or tab sharing.");
  }

  const audioTracks = display.getAudioTracks();
  if (!audioTracks.length) {
    display.getTracks().forEach((t) => t.stop());
    throw new AudioSourceError(
      "no-audio",
      'No audio was shared. In the picker choose a browser tab and tick "Also share tab audio".',
    );
  }
  // The picture is not needed; stopping it keeps the capture light. The audio track lives on.
  display.getVideoTracks().forEach((t) => t.stop());

  if (!source.includeMic) return wrap(new MediaStream(audioTracks), "Shared tab audio", () => {});

  let mic: MediaStream;
  try {
    mic = await deps.mediaDevices.getUserMedia(MIC_CONSTRAINTS(source.micDeviceId));
  } catch (err) {
    display.getTracks().forEach((t) => t.stop());
    throw micError(err);
  }

  // Mix tab audio and microphone into one stream so a single recording carries both voices.
  const ctx = deps.createAudioContext();
  const destination = ctx.createMediaStreamDestination();
  ctx.createMediaStreamSource(new MediaStream(audioTracks)).connect(destination);
  ctx.createMediaStreamSource(mic).connect(destination);

  const opened = wrap(destination.stream, "Shared tab audio + microphone", () => {
    mic.getTracks().forEach((t) => t.stop());
    display.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  });
  // The mixed track never "ends" by itself; the shared tab's track is the one to watch.
  audioTracks.forEach((t) => t.addEventListener("ended", () => opened.close()));
  const originalOnEnded = opened.onEnded;
  opened.onEnded = (cb) => {
    originalOnEnded(cb);
    audioTracks.forEach((t) => t.addEventListener("ended", cb, { once: true }));
  };
  return opened;
}

export async function openAudioSource(
  source: AudioSource,
  deps: CaptureDeps = browserDeps(),
): Promise<OpenedAudio> {
  return source.kind === "mic" ? openMic(source.deviceId, deps) : openTab(source, deps);
}

export type AudioInput = { deviceId: string; label: string };

/**
 * Audio inputs with their names. Names are only exposed after the user granted microphone access
 * once, so before that the list has generic entries.
 */
export async function listAudioInputs(
  mediaDevices: Pick<MediaDevices, "enumerateDevices"> = navigator.mediaDevices,
): Promise<AudioInput[]> {
  try {
    const devices = await mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Audio input ${i + 1}` }));
  } catch {
    return [];
  }
}

/** Virtual inputs that carry whatever the computer is playing (macOS/Windows loopback drivers). */
export function looksLikeLoopback(label: string): boolean {
  return /blackhole|loopback|soundflower|vb-?cable|stereo mix|what u hear|virtual/i.test(label);
}
