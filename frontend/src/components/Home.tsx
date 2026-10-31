import { useEffect, useState } from "react";
import { getRevision, listSessions } from "../api";
import type { SessionSummary } from "../types";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Sessions home: every study session as a resumable page, with the next
// revision date computed from its latest graded round.
export function Home({
  onOpen,
  onNotes,
  onPurge,
  onNew,
  refreshToken,
}: {
  onOpen: (session: SessionSummary) => void;
  onNotes: (session: SessionSummary) => void;
  onPurge: (session: SessionSummary) => void;
  onNew: () => void;
  refreshToken: number;
}) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [revise, setRevise] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listSessions()
      .then((body) => {
        if (!live) return;
        setSessions(body.sessions);
        for (const s of body.sessions) {
          if (s.rounds === 0) continue;
          getRevision(s.session_id)
            .then((plan) => {
              if (!live || plan.items.length === 0) return;
              const next = plan.items[0];
              setRevise((cur) => ({
                ...cur,
                [s.session_id]: `Revise ${next.title} by ${fmtDate(next.review_on)}`,
              }));
            })
            .catch(() => undefined);
        }
      })
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [refreshToken]);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Study home</div>
          <h1>Your sessions, and what to revise.</h1>
          <p className="lede">
            Every run is saved as a page. Weak topics come back tomorrow, fragile ones in three days, mastered ones
            in a week — computed from your latest graded round, no model needed.
          </p>
        </div>
        <button className="btn primary" onClick={onNew}>
          New session
        </button>
      </header>

      {error && (
        <div className="error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {!sessions && <div className="waiting">Loading sessions...</div>}
      {sessions && sessions.length === 0 && (
        <section className="panel">
          <h2>No sessions yet.</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Start a seeded demo course or upload your own material.
          </p>
          <div className="row mt-16">
            <button className="btn primary" onClick={onNew}>
              Start your first session
            </button>
          </div>
        </section>
      )}
      {sessions && sessions.length > 0 && (
        <div className="stack">
          {sessions.map((s) => (
            <section className="panel" key={s.session_id} aria-label={s.title}>
              <div className="panel-head">
                <h2>{s.title}</h2>
                <span className="hint">
                  {s.rounds} round{s.rounds === 1 ? "" : "s"}
                  {s.last_mastery !== null ? ` · mastery ${Math.round(s.last_mastery * 100)}%` : ""}
                </span>
              </div>
              <div className="row small muted">
                <span>Started {fmtDate(s.created_at)}</span>
                {s.weak_topics > 0 && <span className="badge weak">{s.weak_topics} weak</span>}
                {revise[s.session_id] && <span className="badge warn">{revise[s.session_id]}</span>}
              </div>
              <div className="row mt-16">
                <button className="btn primary small" onClick={() => onOpen(s)}>
                  Open
                </button>
                <button className="btn small" onClick={() => onNotes(s)}>
                  Notes
                </button>
                <span className="spacer" />
                <button className="btn ghost small" onClick={() => onPurge(s)}>
                  Purge
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
