import { useEffect, useRef, useState } from "react";

export type AssistantContext = {  sessionTitle: string | null;
  rounds: number;
  lastMastery: number | null;
  weakTopics: { title: string; reviewOn?: string }[];
  reviseNext: string | null;
  examCountdown: string | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function answer(query: string, ctx: AssistantContext): string {
  const q = query.toLowerCase();
  const mastery = ctx.lastMastery !== null ? `${Math.round(ctx.lastMastery * 100)} percent mastery` : "no graded rounds yet";
  if (/\b(progress|doing|how am i|status|report)\b/.test(q)) {
    return ctx.sessionTitle
      ? `${ctx.sessionTitle}: ${ctx.rounds} round${ctx.rounds === 1 ? "" : "s"}, ${mastery}.`
      : "No session open. Open one from home first.";
  }
  if (/\b(weak|struggl|hard|difficult|problem)/.test(q)) {
    if (ctx.weakTopics.length === 0) return "No weak topics flagged. You are stable across the board.";
    return `Weakest: ${ctx.weakTopics.map((t) => t.title).join(", ")}.`;
  }
  if (/\b(revise|review|study|next|today|tomorrow|plan)\b/.test(q)) {
    return ctx.reviseNext ?? "Nothing scheduled. Finish an exam and I will tell you what to revise.";
  }
  if (/\b(exam|test|date|deadline|countdown)\b/.test(q)) {
    return ctx.examCountdown ?? "No exam date set. Set one on the home screen and I will count down.";
  }
  if (/\b(help|what can you|commands)\b/.test(q)) {
    return "Ask me: progress, weakest topics, what to revise, or exam countdown.";
  }
  return "I can report progress, weak topics, revision plans, and the exam countdown. Try: what is my progress?";
}

function speak(text: string) {
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
  } catch {
    /* audio unavailable: text reply still shows */
  }
}

// Jarvis-style panel: typed or spoken questions, deterministic answers from
// live session data. No model calls, no network, works offline.
export function Assistant({ context }: { context: AssistantContext }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [log, setLog] = useState<{ who: "you" | "jarvis"; text: string }[]>([
    { who: "jarvis", text: "Systems online. Ask for progress, weak topics, revision, or countdown." },
  ]);
  const recogRef = useRef<SpeechRecognitionInstance | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [log, open]);

  const ask = (text: string) => {
    const query = text.trim();
    if (!query) return;
    const reply = answer(query, context);
    setLog((cur) => [...cur, { who: "you", text: query }, { who: "jarvis", text: reply }]);
    setInput("");
    speak(reply);
  };

  const toggleListen = () => {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setLog((cur) => [...cur, { who: "jarvis", text: "Voice input is not supported in this browser. Type instead." }]);
      return;
    }
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const recog = new Ctor();
    recogRef.current = recog;
    recog.lang = "en-US";
    recog.interimResults = false;
    recog.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setListening(false);
      ask(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    try {
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  return (
    <>
      <button
        className="btn primary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Open assistant"
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 60,
          borderRadius: 999,
          width: 52,
          height: 52,
          padding: 0,
          fontSize: "1.3rem",
        }}
        title="Jarvis: progress, revision, countdown"
      >
        ◉
      </button>
      {open && (
        <section
          className="panel"
          aria-label="Assistant"
          style={{ position: "fixed", right: 20, bottom: 84, width: "min(360px, calc(100vw - 40px)", zIndex: 60, display: "grid", gap: 10 }}
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
              placeholder="Ask: what is my progress?"
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
            <button
              className="btn small"
              onClick={toggleListen}
              aria-label={listening ? "Stop listening" : "Speak"}
              aria-pressed={listening}
              title={listening ? "Stop" : "Speak your question"}
            >
              {listening ? "■" : "🎤"}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
