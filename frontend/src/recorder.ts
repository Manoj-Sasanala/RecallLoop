// Our own transcription pipeline (WhisperFlow-style): capture mic audio,
// cut segments on silence, send each to the local faster-whisper endpoint.
// No browser speech recognition, no cloud STT.

export type VoiceSegment = {
  blob: Blob;
  seconds: number;
};

type Handlers = {
  onSegment: (segment: VoiceSegment) => void;
  onLevel?: (level: number) => void;
  onError?: (message: string) => void;
};

const SILENCE_MS = 1500;
const MIN_SPEECH_MS = 800;
const MAX_SEGMENT_MS = 30000;
const LOUDNESS_THRESHOLD = 0.008;

function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Microphone needs localhost or HTTPS — this page is plain HTTP, so the browser blocks the mic.";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone blocked — allow access in the browser address bar, then tap again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone found — connect one, or type instead.";
  }
  if (name === "NotReadableError") {
    return "Microphone is busy in another app — close it and try again.";
  }
  return "Microphone unavailable — allow access and try again.";
}

export async function recordOnce(handlers: Pick<Handlers, "onSegment" | "onError" | "onLevel">): Promise<() => void> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    handlers.onError?.(micErrorMessage(err));
    return () => undefined;
  }
  return startLoop(stream, { ...handlers, single: true });
}

export async function startLoop(
  stream: MediaStream,
  handlers: Handlers & { single?: boolean },
): Promise<() => void> {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", ""].find((t) => {
    try {
      return t === "" || window.MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
  const audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") {
    try {
      await audioCtx.resume();
    } catch {
      /* will run once user interacts */
    }
  }
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  let stopped = false;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let lastLoudAt = 0;
  let everLoud = false;
  let timer: number | undefined;

  const level = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
  };

  const stopTracks = () => {
    window.clearInterval(timer);
    try {
      recorder?.state !== "inactive" && recorder?.stop();
    } catch {
      /* already stopped */
    }
    try {
      audioCtx.close();
    } catch {
      /* already closed */
    }
    try {
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* already stopped */
    }
  };

  const cutSegment = () => {
    // Called from onstop, at which point state is already "inactive" —
    // only the chunks tell us whether there is audio to send.
    if (chunks.length === 0) return;
    const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
    const seconds = (Date.now() - startedAt) / 1000;
    chunks = [];
    handlers.onSegment({ blob, seconds });
  };

  const record = () => {
    if (stopped) return;
    chunks = [];
    startedAt = Date.now();
    lastLoudAt = startedAt;
    everLoud = false;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      handlers.onError?.("Recording is not supported in this browser.");
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (stopped) return;
      cutSegment();
      if (!handlers.single) record();
    };
    try {
      recorder.start(250);
    } catch {
      return;
    }
    timer = window.setInterval(() => {
      if (stopped || !recorder || recorder.state !== "recording") return;
      const v = level();
      handlers.onLevel?.(v);
      const now = Date.now();
      if (v > LOUDNESS_THRESHOLD) {
        lastLoudAt = now;
        everLoud = true;
      }
      const elapsed = now - startedAt;
      if (elapsed > MAX_SEGMENT_MS) {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
        return;
      }
      if (everLoud && elapsed > MIN_SPEECH_MS && now - lastLoudAt > SILENCE_MS) {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
    }, 200);
  };

  record();
  return () => {
    stopped = true;
    stopTracks();
  };
}

export async function requestMic(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null;
  }
}

export function micSupport(): { ok: boolean; reason: string } {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "Voice input is not supported in this browser. Type instead." };
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return {
      ok: false,
      reason: "Microphone needs localhost or HTTPS — this page is plain HTTP, so the browser blocks the mic.",
    };
  }
  return { ok: true, reason: "" };
}
