import { useEffect, useRef, useState } from "react";
import { recordOnce, requestMic, startLoop, micSupport } from "../recorder";
import { transcribeAudio } from "../api";

export type AssistantSessionRef = { id: string; title: string };

export type AssistantContext = {
  view: string;
  sessionTitle: string | null;
  rounds: number;
  lastMastery: number | null;
  weakTopics: { title: string; reviewOn?: string }[];
  reviseNext: string | null;
  examCountdown: string | null;
  sessions: AssistantSessionRef[] | null;
};

export type AssistantActions = {
  goHome: () => void;
  openSession: (id: string) => void;
  openNotes: () => void;
  purgeCurrent: () => void;
  purgeSession: (id: string, title: string) => void;
};

type CommandResult = { reply: string; action?: () => void };

function findSession(ctx: { sessions: AssistantSessionRef[] | null }, query: string): AssistantSessionRef | null {
  const sessions = ctx.sessions ?? [];
  const FILLER = /^(hey|hi|hello|okay|please|jarvis|can you|could you|would you|will you|kindly|i want you to|i want to|now)\b[, ]*/;
  const NOISE = /\b(please|kindly|her|him|it|this|that|the|a|an|my|session|thing|stuff|for me|me)\b/g;
  const COMMAND_WORDS = /^(open|show|load|delete|purge|remove|clear|start|quiz|exam|go|take)$/;
  const words = query
    .toLowerCase()
    .replace(/[?,.!"']/g, " ")
    .replace(FILLER, "")
    .replace(NOISE, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !COMMAND_WORDS.test(w));
  if (words.length === 0) return null;
  const wordHit = (a: string, b: string): boolean => {
    if (a === b) return true;
    const n = Math.min(5, a.length, b.length);
    return n >= 4 && a.slice(0, n) === b.slice(0, n);
  };
  const ranked = sessions
    .map((s) => {
      const titleWords = s.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      let score = 0;
      for (const w of words) {
        if (w.length < 3) continue;
        if (titleWords.some((t) => wordHit(w, t))) score += w.length >= 6 ? 2 : 1;
      }
      return { s, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.length > 0 ? ranked[0].s : null;
}

function uniqueTitles(sessions: AssistantSessionRef[] | null, limit = 4): string {
  const titles = [...new Set((sessions ?? []).map((s) => s.title))];
  const shown = titles.slice(0, limit).join("; ");
  return titles.length > limit ? `${shown}; and ${titles.length - limit} more` : shown;
}

function hasTargetWords(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[?,.!"']/g, " ")
    .replace(/\b(please|kindly|her|him|it|this|that|the|a|an|my|session|thing|stuff|for me|me|delete|purge|remove|clear|open|show|load)\b/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  return words.length > 0;
}

function handleCommand(query: string, ctx: AssistantContext, actions: AssistantActions): CommandResult {
  const q = query.toLowerCase().trim();

  // --- Actions: the agent operates the app ---
  if (/\b(go\s+)?home\b/.test(q) || q === "home" || /\b(all sessions|all my sessions|main page|main screen|back to (all )?sessions|go back|home screen|session list)\b/.test(q)) {
    return { reply: "Taking you home.", action: actions.goHome };
  }
  const openMatch = q.match(/(?:open|show|load)\s+(.+)/);
  if (openMatch) {
    if (ctx.sessions === null) return { reply: "Still loading your sessions — ask again in a moment." };
    const target = findSession(ctx, openMatch[1]);
    if (target) return { reply: `Opening ${target.title}.`, action: () => actions.openSession(target.id) };
    return { reply: `I cannot find that. Your sessions: ${uniqueTitles(ctx.sessions) || "none yet"}.` };
  }
  if (/\bnotes?\b/.test(q) && /\b(open|show|write)\b/.test(q)) {
    if (!ctx.sessionTitle) return { reply: "Open a session first, then I will take you to its notes." };
    return { reply: "Opening your notes.", action: actions.openNotes };
  }
  const deleteMatch = q.match(/(?:delete|purge|remove|clear)\s+(.+)/);
  if (deleteMatch || /\b(delete|purge|remove|clear)\b/.test(q)) {
    // A named target wins over the open session — never delete the wrong one.
    const named = deleteMatch && ctx.sessions !== null ? findSession(ctx, deleteMatch[1]) : null;
    if (named) {
      return { reply: `Deleting "${named.title}" after your confirmation.`, action: () => actions.purgeSession(named.id, named.title) };
    }
    if (ctx.sessions === null) return { reply: "Still loading your sessions — ask again in a moment." };
    if (deleteMatch && hasTargetWords(deleteMatch[1])) {
      return { reply: `I cannot find that. Your sessions: ${uniqueTitles(ctx.sessions) || "none yet"}.` };
    }
    if (!ctx.sessionTitle) return { reply: "There is no open session to delete." };
    return { reply: `Deleting "${ctx.sessionTitle}" after your confirmation.`, action: actions.purgeCurrent };
  }

  // --- Reporting: the agent sees the screen state ---
  const mastery = ctx.lastMastery !== null ? `${Math.round(ctx.lastMastery * 100)} percent mastery` : "no graded rounds yet";
  if (/\b(where am i|which screen|what (page|screen))\b/.test(q)) {
    return { reply: `You are on the ${ctx.view} screen${ctx.sessionTitle ? ` in session "${ctx.sessionTitle}"` : ""}.` };
  }
  if (/\b(progress|doing|how am i|status|report)\b/.test(q)) {
    return {
      reply: ctx.sessionTitle
        ? `${ctx.sessionTitle}: ${ctx.rounds} round${ctx.rounds === 1 ? "" : "s"}, ${mastery}.`
        : "No session open. Open one from home first.",
    };
  }
  if (/\b(weak|struggl|hard|difficult|problem)/.test(q)) {
    if (ctx.weakTopics.length === 0) return { reply: "No weak topics flagged. You are stable across the board." };
    return { reply: `Weakest: ${ctx.weakTopics.map((t) => t.title).join(", ")}.` };
  }
  if (/\b(revise|review|study|next|today|tomorrow|plan)\b/.test(q)) {
    return { reply: ctx.reviseNext ?? "Nothing scheduled. Finish an exam and I will tell you what to revise." };
  }
  if (/\b(exam|test|date|deadline|countdown)\b/.test(q)) {
    return { reply: ctx.examCountdown ?? "No exam date set. Set one on the home screen and I will count down." };
  }
  if (/\b(help|what can you|commands)\b/.test(q)) {
    return {
      reply:
        "I can open sessions by name, take you home or to notes, delete the open session, and report progress, weak topics, revision, countdown, or where you are. Try: open my cardio session.",
    };
  }
  return { reply: "I can open sessions, navigate, delete, and report progress, weak topics, revision, or countdown. Try: where am I?" };
}

// Orb assistant: click toggles the conversation panel. Mic dictates into the
// box; Live holds an open conversation; spoken replies play back. Hearing is
// our own faster-whisper endpoint — no browser or cloud speech recognition.
export function Assistant({
  context,
  actions,
}: {
  context: AssistantContext;
  actions: AssistantActions;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [working, setWorking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [log, setLog] = useState<{ who: "you" | "jarvis"; text: string }[]>([
    { who: "jarvis", text: "Systems online. Ask, dictate, or go live — I can also open and organize for you." },
  ]);
  const stopRef = useRef<(() => void) | null>(null);
  const liveRef = useRef(false);
  const speakingRef = useRef(false);
  const lastSpokenRef = useRef("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const contextRef = useRef(context);
  contextRef.current = context;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [log, open]);

  useEffect(
    () => () => {
      stopAll();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stopAll = () => {
    liveRef.current = false;
    try {
      stopRef.current?.();
    } catch {
      /* already stopped */
    }
    stopRef.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* audio unavailable */
    }
    speakingRef.current = false;
    setListening(false);
    setSpeaking(false);
    setWorking(false);
    setMicLevel(0);
  };

  const speak = (text: string) => {
    try {
      speakingRef.current = true;
      setSpeaking(true);
      lastSpokenRef.current = text.toLowerCase();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onend = utterance.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    } catch {
      speakingRef.current = false;
      setSpeaking(false);
    }
  };

  const ask = (text: string) => {
    const query = text.trim();
    if (!query) return;
    const { reply, action } = handleCommand(query, contextRef.current, actionsRef.current);
    setLog((cur) => [...cur, { who: "you", text: query }, { who: "jarvis", text: reply }]);
    setInput("");
    speak(reply);
    action?.();
  };

  const transcribe = async (blob: Blob): Promise<string> => {
    setWorking(true);
    try {
      const { text } = await transcribeAudio(blob);
      return text.trim();
    } catch {
      setLog((cur) => [
        ...cur,
        { who: "jarvis", text: "I could not transcribe that — try again, a little louder." },
      ]);
      return "";
    } finally {
      setWorking(false);
    }
  };

  // Barge-in: user starts talking while Jarvis speaks. Our own echo is short
  // and matches what we just said — ignore it. Returns true when this is the
  // user interrupting (speech already stopped), false for echo or silence.
  const heardWhileSpeaking = (text: string): boolean => {
    if (!speakingRef.current) return true;
    const heard = text.toLowerCase().trim();
    if (!heard) return false;
    if (heard.length < 25 && lastSpokenRef.current.includes(heard)) return false;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* already stopped */
    }
    speakingRef.current = false;
    setSpeaking(false);
    return true;
  };

  const handleSegment = async (blob: Blob, mode: "dictate" | "live") => {
    const text = await transcribe(blob);
    if (!text) return;
    if (mode === "dictate") {
      setInput((cur) => (cur ? `${cur} ${text}` : text));
      return;
    }
    if (heardWhileSpeaking(text)) ask(text);
  };

  // Mic: dictate once into the box. Second tap stops early; silence stops it.
  const dictate = async () => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setListening(false);
      return;
    }
    const support = micSupport();
    if (!support.ok) {
      setLog((cur) => [...cur, { who: "jarvis", text: support.reason }]);
      return;
    }
    liveRef.current = false;
    try {
      stopRef.current = await recordOnce({
        onSegment: ({ blob }) => void handleSegment(blob, "dictate"),
        onLevel: (v) => setMicLevel(Math.min(1, v * 4)),
        onError: (message) =>
          setLog((cur) => [...cur, { who: "jarvis", text: message }]),
      });
      setListening(true);
    } catch {
      setListening(false);
      setLog((cur) => [...cur, { who: "jarvis", text: "Microphone blocked — allow access and try again." }]);
    }
  };

  // Live: continuous conversation. Talk freely; segments transcribe and answer.
  const toggleLive = async () => {
    if (liveRef.current) {
      liveRef.current = false;
      try {
        stopRef.current?.();
      } catch {
        /* already stopped */
      }
      stopRef.current = null;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* audio unavailable */
      }
      speakingRef.current = false;
      setListening(false);
      setSpeaking(false);
      setMicLevel(0);
      return;
    }
    const support = micSupport();
    if (!support.ok) {
      setLog((cur) => [...cur, { who: "jarvis", text: support.reason }]);
      return;
    }
    const stream = await requestMic();
    if (!stream) {
      setLog((cur) => [...cur, { who: "jarvis", text: "Microphone blocked — allow access and tap Live again." }]);
      return;
    }
    liveRef.current = true;
    try {
      stopRef.current = await startLoop(stream, {
        onSegment: ({ blob }) => void handleSegment(blob, "live"),
        onLevel: (v) => setMicLevel(Math.min(1, v * 4)),
        onError: (message) => {
          liveRef.current = false;
          setListening(false);
          setMicLevel(0);
          setLog((cur) => [...cur, { who: "jarvis", text: message }]);
        },
      });
      setListening(true);
    } catch {
      liveRef.current = false;
      setListening(false);
    }
  };

  const orbActive = listening || speaking || working;

  return (
    <>
      <button
        className={`orb${orbActive ? " orb-live" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Open assistant"
        title="Jarvis: click to open or minimize"
      >
        <span className="orb-core" aria-hidden="true" />
      </button>
      {open && (
        <section
          className="panel"
          aria-label="Assistant"
          style={{ position: "fixed", right: 20, bottom: 92, width: "min(360px, calc(100vw - 40px)", zIndex: 60, display: "grid", gap: 10 }}
        >
          <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 8 }}>
            {log.map((m, i) => (
              <div
                key={i}
                className="small"
                style={{
                  justifySelf: m.who === "you" ? "end" : "start",
                  background: m.who === "you" ? "var(--paper)" : "var(--accent-soft)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius)",
                  padding: "6px 10px",
                  maxWidth: "90%",
                }}
              >
                <span className="mono" style={{ color: "var(--muted)" }}>
                  {m.who === "you" ? "you" : "jarvis"}:
                </span>{" "}
                {m.text}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="row">
            <div
              aria-hidden="true"
              title="Microphone level"
              style={{
                flex: "0 0 8px",
                height: 34,
                border: "1px solid var(--line)",
                borderRadius: 4,
                background: "var(--paper)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: `${Math.round(micLevel * 100)}%`,
                  background: listening ? "var(--accent)" : "var(--line)",
                  transition: "height 120ms",
                }}
              />
            </div>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ask(input);
              }}
              placeholder="Ask, or dictate with the mic..."
              aria-label="Ask the assistant"
              style={{
                flex: 1,
                font: "inherit",
                padding: "8px 10px",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius)",
                background: "var(--surface)",
              }}
            />
            <button className="btn small" onClick={() => ask(input)} aria-label="Send">
              Send
            </button>
            <button className="btn small" onClick={() => void dictate()} aria-label="Dictate" title="Dictate into the box">
              🎤
            </button>
            <button
              className={`btn small${liveRef.current ? " primary" : ""}`}
              onClick={() => void toggleLive()}
              aria-label={liveRef.current ? "Stop live conversation" : "Start live conversation"}
              aria-pressed={liveRef.current}
              title="Live conversation: talk freely, hands-free"
            >
              {liveRef.current ? "■ Live" : "● Live"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
