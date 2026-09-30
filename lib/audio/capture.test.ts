import { describe, expect, it, vi } from "vitest";
import {
  AudioSourceError,
  listAudioInputs,
  looksLikeLoopback,
  openAudioSource,
  type CaptureDeps,
} from "./capture";

// --- minimal fakes for the browser's media objects -------------------------------------------
class FakeTrack extends EventTarget {
  stopped = false;
  constructor(readonly kind: "audio" | "video") {
    super();
  }
  stop() {
    this.stopped = true;
  }
  end() {
    this.dispatchEvent(new Event("ended"));
  }
}
class FakeStream {
  constructor(readonly tracks: FakeTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === "video");
  }
}
(globalThis as { MediaStream?: unknown }).MediaStream = class extends FakeStream {
  constructor(tracks: FakeTrack[] = []) {
    super(tracks);
  }
};

const stream = (...kinds: ("audio" | "video")[]) =>
  new FakeStream(kinds.map((k) => new FakeTrack(k))) as unknown as MediaStream;
const domError = (name: string) => new DOMException("x", name);

function deps(over: Partial<CaptureDeps["mediaDevices"]> = {}, ctx?: unknown): CaptureDeps {
  return {
    mediaDevices: {
      getUserMedia: vi.fn(async () => stream("audio")),
      getDisplayMedia: vi.fn(async () => stream("video", "audio")),
      ...over,
    } as CaptureDeps["mediaDevices"],
    createAudioContext: () => (ctx ?? fakeContext()) as AudioContext,
  };
}

function fakeContext() {
  const dest = { stream: stream("audio") };
  return {
    createMediaStreamDestination: () => dest,
    createMediaStreamSource: () => ({ connect: vi.fn() }),
    close: vi.fn(async () => {}),
  };
}

describe("microphone source", () => {
  it("opens the default microphone with speech processing on", async () => {
    const d = deps();
    const opened = await openAudioSource({ kind: "mic" }, d);
    expect(opened.label).toBe("Microphone");
    const constraints = (d.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(constraints.audio).toMatchObject({ echoCancellation: true, noiseSuppression: true });
    expect(constraints.audio.deviceId).toBeUndefined();
  });

  it("asks for a specific device exactly", async () => {
    const d = deps();
    await openAudioSource({ kind: "mic", deviceId: "blackhole-id" }, d);
    const constraints = (d.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(constraints.audio.deviceId).toEqual({ exact: "blackhole-id" });
  });

  it.each([
    ["NotAllowedError", "denied"],
    ["NotFoundError", "unavailable"],
    ["OverconstrainedError", "unavailable"],
    ["AbortError", "unavailable"],
  ])("maps %s to %s", async (name, code) => {
    const d = deps({ getUserMedia: vi.fn(async () => Promise.reject(domError(name))) });
    await expect(openAudioSource({ kind: "mic" }, d)).rejects.toMatchObject({ code });
  });

  it("reports an unsupported browser", async () => {
    const d = { ...deps(), mediaDevices: {} as CaptureDeps["mediaDevices"] };
    await expect(openAudioSource({ kind: "mic" }, d)).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("stops every track on close, once, and tells listeners when a track ends by itself", async () => {
    const s = stream("audio");
    const d = deps({ getUserMedia: vi.fn(async () => s) });
    const opened = await openAudioSource({ kind: "mic" }, d);
    const ended = vi.fn();
    opened.onEnded(ended);
    (s.getAudioTracks()[0] as unknown as FakeTrack).end();
    expect(ended).toHaveBeenCalledTimes(1);
    (s.getAudioTracks()[0] as unknown as FakeTrack).end();
    expect(ended).toHaveBeenCalledTimes(1); // only once

    opened.close();
    opened.close();
    expect((s.getTracks()[0] as unknown as FakeTrack).stopped).toBe(true);
  });

  it("does not report 'ended' for a source we closed ourselves", async () => {
    const s = stream("audio");
    const opened = await openAudioSource(
      { kind: "mic" },
      deps({ getUserMedia: vi.fn(async () => s) }),
    );
    const ended = vi.fn();
    opened.onEnded(ended);
    opened.close();
    (s.getAudioTracks()[0] as unknown as FakeTrack).end();
    expect(ended).not.toHaveBeenCalled();
  });
});

describe("tab source", () => {
  it("captures tab audio without speech processing and drops the picture", async () => {
    const display = stream("video", "audio");
    const d = deps({ getDisplayMedia: vi.fn(async () => display) });
    const opened = await openAudioSource({ kind: "tab", includeMic: false }, d);
    expect(opened.label).toBe("Shared tab audio");
    const args = (d.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.video).toBe(true);
    expect(args.audio).toMatchObject({ echoCancellation: false, noiseSuppression: false });
    expect((display.getVideoTracks()[0] as unknown as FakeTrack).stopped).toBe(true);
    expect(opened.stream.getAudioTracks()).toHaveLength(1);
    expect(d.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("explains how to share audio when none was shared", async () => {
    const display = stream("video");
    const d = deps({ getDisplayMedia: vi.fn(async () => display) });
    const err = await openAudioSource({ kind: "tab", includeMic: false }, d).catch((e) => e);
    expect(err).toBeInstanceOf(AudioSourceError);
    expect(err.code).toBe("no-audio");
    expect(err.message).toMatch(/Also share tab audio/);
    expect((display.getVideoTracks()[0] as unknown as FakeTrack).stopped).toBe(true);
  });

  it("treats dismissing the picker as a cancel", async () => {
    const d = deps({
      getDisplayMedia: vi.fn(async () => Promise.reject(domError("NotAllowedError"))),
    });
    await expect(openAudioSource({ kind: "tab", includeMic: false }, d)).rejects.toMatchObject({
      code: "cancelled",
    });
  });

  it("reports browsers without getDisplayMedia", async () => {
    const d = deps({ getDisplayMedia: undefined });
    await expect(openAudioSource({ kind: "tab", includeMic: false }, d)).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("notices when sharing stops", async () => {
    const display = stream("video", "audio");
    const opened = await openAudioSource(
      { kind: "tab", includeMic: false },
      deps({ getDisplayMedia: vi.fn(async () => display) }),
    );
    const ended = vi.fn();
    opened.onEnded(ended);
    (display.getAudioTracks()[0] as unknown as FakeTrack).end();
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("mixes tab audio with the microphone into one stream and cleans up everything", async () => {
    const display = stream("video", "audio");
    const mic = stream("audio");
    const ctx = fakeContext();
    const d = deps(
      { getDisplayMedia: vi.fn(async () => display), getUserMedia: vi.fn(async () => mic) },
      ctx,
    );
    const opened = await openAudioSource({ kind: "tab", includeMic: true, micDeviceId: "m1" }, d);
    expect(opened.label).toBe("Shared tab audio + microphone");
    expect(opened.stream).toBe(ctx.createMediaStreamDestination().stream);
    const micConstraints = (d.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(micConstraints.audio.deviceId).toEqual({ exact: "m1" });

    opened.close();
    expect((mic.getTracks()[0] as unknown as FakeTrack).stopped).toBe(true);
    expect((display.getAudioTracks()[0] as unknown as FakeTrack).stopped).toBe(true);
    expect(ctx.close).toHaveBeenCalled();
  });

  it("releases the shared tab when the microphone cannot be opened", async () => {
    const display = stream("video", "audio");
    const d = deps({
      getDisplayMedia: vi.fn(async () => display),
      getUserMedia: vi.fn(async () => Promise.reject(domError("NotAllowedError"))),
    });
    await expect(openAudioSource({ kind: "tab", includeMic: true }, d)).rejects.toMatchObject({
      code: "denied",
    });
    expect((display.getAudioTracks()[0] as unknown as FakeTrack).stopped).toBe(true);
  });
});

describe("listAudioInputs / looksLikeLoopback", () => {
  it("lists named audio inputs only", async () => {
    const list = await listAudioInputs({
      enumerateDevices: async () =>
        [
          { kind: "audioinput", deviceId: "default", label: "Default" },
          { kind: "audioinput", deviceId: "a", label: "MacBook Pro Microphone" },
          { kind: "audioinput", deviceId: "b", label: "" },
          { kind: "videoinput", deviceId: "c", label: "Camera" },
          { kind: "audiooutput", deviceId: "d", label: "Speakers" },
        ] as MediaDeviceInfo[],
    });
    expect(list).toEqual([
      { deviceId: "a", label: "MacBook Pro Microphone" },
      { deviceId: "b", label: "Audio input 2" },
    ]);
  });
  it("returns [] if enumeration fails", async () => {
    expect(
      await listAudioInputs({
        enumerateDevices: async () => {
          throw new Error("nope");
        },
      }),
    ).toEqual([]);
  });
  it("recognizes loopback drivers", () => {
    for (const l of [
      "BlackHole 2ch",
      "Loopback Audio",
      "Soundflower (2ch)",
      "CABLE Output (VB-Audio Virtual Cable)",
      "Stereo Mix",
    ])
      expect(looksLikeLoopback(l)).toBe(true);
    expect(looksLikeLoopback("MacBook Pro Microphone")).toBe(false);
  });
});
