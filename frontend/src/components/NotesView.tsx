import { useEffect, useRef, useState } from "react";
import { getNotes, saveNotes } from "../api";

// Plain markdown notes per session, autosaved. Exported with the study page.
export function NotesView({ sessionId, title, onBack }: { sessionId: string; title: string; onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    getNotes(sessionId)
      .then((body) => live && (setText(body.notes_md), setSaved(true)))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [sessionId]);

  const edit = (value: string) => {
    setText(value);
    setSaved(false);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveNotes(sessionId, value)
        .then(() => setSaved(true))
        .catch((err: Error) => setError(err.message));
    }, 800);
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Notes</div>
          <h1>{title}</h1>
          <p className="lede">Your own words, next to the machine's diagnosis. Autosaves as you type.</p>
        </div>
        <span className="session-chip">
          <span className="dot" aria-hidden="true" /> {saved ? "Saved" : "Saving..."}
        </span>
      </header>

      {error && (
        <div className="error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {text === null ? (
        <div className="waiting">Loading notes...</div>
      ) : (
        <section className="panel">
          <label className="sr-only" htmlFor="session-notes">
            Session notes in Markdown
          </label>
          <textarea
            id="session-notes"
            value={text}
            onChange={(e) => edit(e.target.value)}
            rows={18}
            placeholder={"# What I must remember\n\n- ...\n\n## Traps I fell for\n\n- ..."}
            style={{
              width: "100%",
              font: "inherit",
              fontFamily: "var(--mono)",
              fontSize: "0.88rem",
              lineHeight: 1.7,
              padding: 12,
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              background: "var(--paper)",
              resize: "vertical",
            }}
          />
          <div className="row mt-16">
            <button className="btn" onClick={onBack}>
              Back
            </button>
          </div>
        </section>
      )}
    </>
  );
}
