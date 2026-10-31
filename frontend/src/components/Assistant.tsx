import { useEffect, useRef, useState } from "react";

export type AssistantSessionRef = { id: string; title: string };

export type AssistantContext = {
  view: string;
  sessionTitle: string | null;
  rounds: number;
  lastMastery: number | null;
  weakTopics: { title: string; reviewOn?: string }[];
  reviseNext: string | null;
  examCountdown: string | null;
  sessions: AssistantSessionRef[];
};

export type AssistantActions = {
  goHome: () => void;
  openSession: (id: string) => void;
  openNotes: () => void;
  purgeCurrent: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((
        event: {
          resultIndex: number;
          results: { isFinal: boolean; 0: { transcript: string } }[];
        },
      ) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type CommandResult = { reply: string; action?: () => void };

function findSession(ctx: AssistantContext, query: string): AssistantSessionRef | null {
  const q = query.toLowerCase();
  const scored = ctx.sessions
    .map((s) => {
      const title = s.title.toLowerCase();
      if (title === q) return { s, score: 3 };
      if (title.includes(q)) return { s, score: 2 };
      if (q.split(/\s+/).some((w) => w.length > 3 && title.includes(w))) return { s, score: 1 };
      return { s, score: 0 };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length > 0 ? scored[0].s : null;
}

function handleCommand(query: string, ctx: AssistantContext, actions: AssistantActions): CommandResult {
  const q = query.toLowerCase().trim();

  // --- Actions: the agent operates the app ---
  if (/\b(go\s+)?home\b/.test(q) || q === "home") {
    return { reply: "Taking you home.", action: actions.goHome };
  }
  const openMatch = q.match(/(?:open|show|load)\s+(.+)/);
  if (openMatch) {
    const target = findSession(ctx, openMatch[1]);
    if (target) return { reply: `Opening ${target.title}.`, action: () => actions.openSession(target.id) };
    return { reply: `I cannot find a session called "${openMatch[1]}". Your sessions: ${ctx.sessions.map((s) => s.title).join("; ") || "none yet"}.` };
  }
  if (/\bnotes?\b/.test(q) && /\b(open|show|write)\b/.test(q)) {
    if (!ctx.sessionTitle) return { reply: "Open a session first, then I will take you to its notes." };
    return { reply: "Opening your notes.", action: actions.openNotes };
  }
  if (/\b(delete|purge|remove).*(session|it|this)\b/.test(q)) {
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
// box; Live holds an open conversation; spoken replies play back. No model
// calls — answers come from live session data, actions drive the app.
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
  const [log, setLog] = useState<{ who: "you" | "jarvis"; text: string }[]>([
    { who: "jarvis", text: "Systems online. Ask, dictate, or go live — I can also open and organize for you." },
  ]);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  const convoRef = useRef(false);
  const speakingRef = useRef(false);
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
      convoRef.current = false;
      try {
        recogRef.current?.abort();
      } catch {
        /* already stopped */
      }
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* audio unavailable */
      }
    },
    [],
  );

  const speak = (text: string) => {
    try {
      speakingRef.current = true;
      setSpeaking(true);
      try {
        recogRef.current?.abort();
      } catch {
        /* mic already stopped */
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onend = utterance.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
        if (convoRef.current && recogRef.current) {
          try {
            recogRef.current.start();
          } catch {
            /* already running or stopped: onend handler recovers */
          }
        }
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

  const startRecog = (continuous: boolean, onFinal: (text: string) => void): boolean => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return false;
    try {
      recogRef.current?.abort();
    } catch {
      /* nothing running */
    }
    const recog = new Ctor();
    recogRef.current = recog;
    recog.lang = "en-US";
    recog.continuous = continuous;
    recog.interimResults = continuous;
    recog.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText.trim()) onFinal(finalText);
    };
    recog.onerror = () => {
      if (!convoRef.current) setListening(false);
    };
    recog.onend = () => {
      if (convoRef.current && continuous && !speakingRef.current) {
        try {
          recog.start();
          return;
        } catch {
          /* fall through to stopped state */
        }
      }
      setListening(false);
    };
    try {
      recog.start();
      setListening(true);
      return true;
    } catch {
      setListening(false);
      return false;
    }
  };

  // Mic: dictate once into the box. It types for you; you press Send.
  const dictate = () => {
    if (speakingRef.current) return;
    convoRef.current = false;
    const ok = startRecog(false, (text) => {
      setInput((cur) => (cur ? `${cur} ${text}` : text));
      try {
        recogRef.current?.abort();
      } catch {
        /* single shot done */
      }
      setListening(false);
    });
    if (!ok) {
      setLog((cur) => [...cur, { who: "jarvis", text: "Voice input is not supported in this browser. Type instead." }]);
    }
  };

  // Live: continuous conversation. Talk freely; replies speak back.
  const toggleLive = () => {
    if (convoRef.current) {
      convoRef.current = false;
      speakingRef.current = false;
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* audio unavailable */
      }
      try {
        recogRef.current?.abort();
      } catch {
        /* already stopped */
      }
      setListening(false);
      setSpeaking(false);
      return;
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setLog((cur) => [...cur, { who: "jarvis", text: "Voice input is not supported in this browser. Type instead." }]);
      return;
    }
    convoRef.current = true;
    startRecog(true, (text) => ask(text));
  };

  const orbActive = listening || speaking;

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
            <button className="btn small" onClick={dictate} aria-label="Dictate" title="Dictate into the box">
              🎤
            </button>
            <button
              className={`btn small${convoRef.current ? " primary" : ""}`}
              onClick={toggleLive}
              aria-label={convoRef.current ? "Stop live conversation" : "Start live conversation"}
              aria-pressed={convoRef.current}
              title="Live conversation: talk freely, hands-free"
            >
              {convoRef.current ? "■ Live" : "● Live"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
