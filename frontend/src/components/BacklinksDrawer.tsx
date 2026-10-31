import { useState } from "react";
import type { GradedItem, Topic } from "../types";
import { loadNotes, saveNote, type TopicNote } from "../notes";

export type BacklinksDrawerData = {
  topic: Topic;
  masteryScore?: number | null;
  rawAccuracy?: number | null;
  vulnerabilityScore?: number | null;
  isFlaggedWeak?: boolean;
  trappedMisconceptions?: string[];
  prerequisiteTopics: Topic[];
  dependentTopics: Topic[];
  coOccurringTopics?: Topic[];
  testedQuestions?: GradedItem[];
};

export function BacklinksDrawer({
  data,
  sessionId,
  onClose,
  onSelectTopic,
  onOpenQuote,
}: {
  data: BacklinksDrawerData;
  sessionId?: string;
  onClose: () => void;
  onSelectTopic: (topicId: string) => void;
  onOpenQuote: (page: number, quote: string) => void;
}) {
  const {
    topic,
    masteryScore,
    rawAccuracy,
    vulnerabilityScore,
    isFlaggedWeak,
    trappedMisconceptions = [],
    prerequisiteTopics,
    dependentTopics,
    coOccurringTopics = [],
    testedQuestions = [],
  } = data;

  const docId = topic.page_refs[0]?.doc_id ?? "";

  const [note, setNote] = useState<TopicNote>(() =>
    sessionId ? loadNotes(sessionId)[topic.topic_id] ?? { text: "", reviseBy: "" } : { text: "", reviseBy: "" },
  );

  const statusTone = isFlaggedWeak
    ? "weak"
    : masteryScore !== null && masteryScore !== undefined && masteryScore >= 0.8
    ? "ok"
    : "warn";

  return (
    <div
      className="drawer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="backlinks-drawer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="drawer obsidian-inspector">
        <div className="drawer-head">
          <div>
            <div className="row" style={{ gap: 6, marginBottom: 4 }}>
              <span className="badge mono">{topic.code}</span>
              <span className="eyebrow" style={{ margin: 0 }}>
                {Math.round(topic.syllabus_weight * 100)}% exam weight
              </span>
              {topic.out_degree > 0 && (
                <span className="badge ok">
                  Unlocks {topic.out_degree} {topic.out_degree === 1 ? "topic" : "topics"}
                </span>
              )}
            </div>
            <h2 id="backlinks-drawer-title" style={{ fontSize: "1.25rem" }}>
              {topic.title}
            </h2>
          </div>
          <button className="btn small ghost" onClick={onClose} aria-label="Close backlinks inspector">
            Close ✕
          </button>
        </div>

        <div className="obsidian-inspector-content">
          {/* Diagnostic status block if available */}
          {masteryScore !== undefined && masteryScore !== null && (
            <div className="panel" style={{ padding: "14px 16px", marginBottom: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <span className="small muted">Mastery state</span>
                <span className={`badge ${statusTone}`}>
                  {isFlaggedWeak ? "Flagged weak" : masteryScore >= 0.8 ? "Mastered" : "Fragile"}
                </span>
              </div>
              <div className="meter" aria-hidden="true" style={{ height: 7, marginBottom: 8 }}>
                <span
                  className={masteryScore < 0.6 ? "low" : ""}
                  style={{ width: `${Math.round(masteryScore * 100)}%` }}
                />
              </div>
              <div className="row small" style={{ justifyContent: "space-between", color: "var(--ink-soft)" }}>
                <span>Score: {Math.round(masteryScore * 100)}%</span>
                {rawAccuracy !== null && rawAccuracy !== undefined && (
                  <span>Accuracy: {Math.round(rawAccuracy * 100)}%</span>
                )}
                {vulnerabilityScore !== null && vulnerabilityScore !== undefined && (
                  <span>Vulnerability: {vulnerabilityScore.toFixed(2)}</span>
                )}
              </div>
            </div>
          )}

          {/* Trapped Misconceptions Alert */}
          {trappedMisconceptions.length > 0 && (
            <div className="notice" style={{ marginBottom: 16, borderLeft: "3px solid var(--danger)" }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--danger)", marginBottom: 4 }}>
                Active Misconception Detected
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: "0.85rem" }}>
                {trappedMisconceptions.map((m, i) => (
                  <li key={i} className="mono">
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Prerequisite & Dependent Network (Obsidian Graph Backlinks) */}
          <div className="panel" style={{ padding: "14px 16px", marginBottom: 16 }}>
            <h3 style={{ fontSize: "0.92rem", marginBottom: 10 }}>Knowledge Network</h3>

            <div style={{ marginBottom: 12 }}>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Prerequisites (Must master first):
              </div>
              {prerequisiteTopics.length === 0 ? (
                <div className="small muted italic">None (Foundational entry point)</div>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  {prerequisiteTopics.map((p) => (
                    <button
                      key={p.topic_id}
                      className="btn small"
                      style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                      onClick={() => onSelectTopic(p.topic_id)}
                      title={`Inspect ${p.title}`}
                    >
                      ← {p.code}: {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                Dependents (Unlocked by this topic):
              </div>
              {dependentTopics.length === 0 ? (
                <div className="small muted italic">None (Terminal leaf node)</div>
              ) : (
                <div className="row" style={{ gap: 6 }}>
                  {dependentTopics.map((d) => (
                    <button
                      key={d.topic_id}
                      className="btn small"
                      style={{ padding: "4px 8px", fontSize: "0.78rem" }}
                      onClick={() => onSelectTopic(d.topic_id)}
                      title={`Inspect ${d.title}`}
                    >
                      → {d.code}: {d.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Source Citations & References */}
          <div className="panel" style={{ padding: "14px 16px", marginBottom: 16 }}>
            <h3 style={{ fontSize: "0.92rem", marginBottom: 10 }}>Source Citations</h3>
            <div className="stack" style={{ gap: 8 }}>
              {topic.page_refs.map((ref, i) => (
                <div key={i} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="small">
                    Pages {ref.start_page === ref.end_page ? ref.start_page : `${ref.start_page}–${ref.end_page}`}
                  </span>
                  {docId && (
                    <button
                      className="btn ghost small"
                      onClick={() => onOpenQuote(ref.start_page, "")}
                    >
                      View Source Page →
                    </button>
                  )}
                </div>
              ))}
            </div>

            {coOccurringTopics.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
                <span className="small muted">Shared literature references with:</span>
                <div className="row" style={{ gap: 6, marginTop: 6 }}>
                  {coOccurringTopics.map((c) => (
                    <button
                      key={c.topic_id}
                      className="btn small ghost"
                      style={{ padding: "2px 6px", fontSize: "0.75rem" }}
                      onClick={() => onSelectTopic(c.topic_id)}
                    >
                      {c.code} {c.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* My Notes */}
        <div className="panel" style={{ padding: "14px 16px", marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.92rem", marginBottom: 10 }}>My notes</h3>
          <label className="small muted" htmlFor={`notes-${topic.topic_id}`}>
            Your own words. Saved in this browser, included in the export.
          </label>
          <textarea
            id={`notes-${topic.topic_id}`}
            value={note.text}
            onChange={(e) => {
              const next = { ...note, text: e.target.value };
              setNote(next);
              if (sessionId) saveNote(sessionId, topic.topic_id, next);
            }}
            rows={3}
            placeholder="e.g. Leader election = timeout, not the client. Remember T1 → T2."
            style={{
              width: "100%",
              font: "inherit",
              fontSize: "0.85rem",
              padding: "8px 10px",
              marginTop: 6,
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius)",
              background: "var(--paper)",
              resize: "vertical",
            }}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <label className="small muted" htmlFor={`revise-${topic.topic_id}`}>
              Revise by
            </label>
            <input
              id={`revise-${topic.topic_id}`}
              type="date"
              value={note.reviseBy}
              onChange={(e) => {
                const next = { ...note, reviseBy: e.target.value };
                setNote(next);
                if (sessionId) saveNote(sessionId, topic.topic_id, next);
              }}
              style={{
                font: "inherit",
                fontSize: "0.82rem",
                padding: "6px 8px",
                border: "1px solid var(--line-strong)",
                borderRadius: "var(--radius)",
                background: "var(--paper)",
              }}
            />
            {note.reviseBy && (
              <span className="badge warn">
                {new Date(`${note.reviseBy}T00:00:00`) < new Date(new Date().toDateString()) ? "overdue" : "scheduled"}
              </span>
            )}
            <span className="spacer" />
            {(note.text.trim() || note.reviseBy) && (
              <button
                className="btn ghost small"
                onClick={() => {
                  const next = { text: "", reviseBy: "" };
                  setNote(next);
                  if (sessionId) saveNote(sessionId, topic.topic_id, next);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Linked Questions Tested */}
          {testedQuestions.length > 0 && (
            <div className="panel" style={{ padding: "14px 16px" }}>
              <h3 style={{ fontSize: "0.92rem", marginBottom: 10 }}>
                Tested Items ({testedQuestions.length})
              </h3>
              <div className="stack" style={{ gap: 12 }}>
                {testedQuestions.map((q) => (
                  <div
                    key={q.question_id}
                    style={{
                      borderBottom: "1px solid var(--line)",
                      paddingBottom: 10,
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div className="small" style={{ fontWeight: 550 }}>
                      {q.stem}
                    </div>
                    <div className="row" style={{ gap: 6, fontSize: "0.75rem" }}>
                      <span className={`badge ${q.is_correct ? "ok" : "weak"}`}>
                        {q.diagnostic_state}
                      </span>
                      <span className="muted">page {q.source_page_number}</span>
                      <button
                        className="btn ghost small"
                        style={{ padding: "0 4px", fontSize: "0.75rem" }}
                        onClick={() => onOpenQuote(q.source_page_number, q.verbatim_source_quote)}
                      >
                        Source quote
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
