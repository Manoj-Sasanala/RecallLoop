import { useMemo, useState } from "react";
import type { Exam, GradeResult, Topic } from "../types";
import { BacklinksDrawer, type BacklinksDrawerData } from "./BacklinksDrawer";
import { KnowledgeGraph, type TopicMasteryInfo } from "./KnowledgeGraph";
import { MasteryBoard } from "./MasteryBoard";

const STATE_LABEL: Record<string, string> = {
  MASTERED: "Mastered",
  FRAGILE_GUESS: "Fragile guess",
  RECOGNIZED_GAP: "Recognised gap",
  LURE_ENTRAPMENT: "Lure entrapment",
};

const STATE_TONE: Record<string, string> = {
  MASTERED: "ok",
  FRAGILE_GUESS: "warn",
  RECOGNIZED_GAP: "warn",
  LURE_ENTRAPMENT: "weak",
};

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function Results({
  grade,
  exam,
  topics = [],
  busy,
  onRemediate,
  onOpenQuote,
}: {
  grade: GradeResult;
  exam: Exam;
  topics?: Topic[];
  busy: boolean;
  onRemediate: () => void;
  onOpenQuote: (page: number, quote: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"diagnosis" | "board" | "graph">("diagnosis");
  const [inspectingTopicId, setInspectingTopicId] = useState<string | null>(null);
  const [itemFilter, setItemFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const counts = grade.summary.state_counts;
  const weak = grade.topic_breakdown.filter((topic) => topic.is_flagged_weak);

  const optionsById = new Map(
    exam.questions.map((question) => [
      question.question_id,
      new Map(question.options.map((option) => [option.option_id, option.text])),
    ]),
  );

  const topicsById = useMemo(() => new Map(topics.map((t) => [t.topic_id, t])), [topics]);

  // Map topic titles or codes to topic IDs if needed
  const topicsByTitle = useMemo(() => new Map(topics.map((t) => [t.title, t])), [topics]);

  const masteryMap = useMemo(() => {
    const map = new Map<string, TopicMasteryInfo>();
    for (const t of grade.topic_breakdown) {
      map.set(t.topic_id, {
        mastery_score: t.mastery_score,
        is_flagged_weak: t.is_flagged_weak,
        trapped_misconceptions: t.trapped_misconceptions,
        raw_accuracy: t.raw_accuracy,
        vulnerability_score: t.vulnerability_score,
      });
    }
    return map;
  }, [grade.topic_breakdown]);

  // Filtered review items (Dataview-style query)
  const filteredItems = useMemo(() => {
    return grade.graded_items.filter((item) => {
      if (itemFilter !== "ALL" && item.diagnostic_state !== itemFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesStem = item.stem.toLowerCase().includes(query);
        const matchesQuote = item.verbatim_source_quote.toLowerCase().includes(query);
        const matchesMisconception = item.endorsed_misconception?.toLowerCase().includes(query);
        if (!matchesStem && !matchesQuote && !matchesMisconception) return false;
      }
      return true;
    });
  }, [grade.graded_items, itemFilter, searchQuery]);

  // Backlinks Drawer Data
  const inspectorData = useMemo<BacklinksDrawerData | null>(() => {
    if (!inspectingTopicId) return null;
    let current = topicsById.get(inspectingTopicId);
    if (!current) {
      // Try finding by title in topic breakdown
      const tb = grade.topic_breakdown.find((b) => b.topic_id === inspectingTopicId);
      if (tb && topicsByTitle.has(tb.title)) current = topicsByTitle.get(tb.title);
    }
    if (!current) return null;

    const prereqs = (current.prerequisites ?? []).map((id) => topicsById.get(id)).filter(Boolean) as Topic[];
    const dependents = topics.filter((t) => (t.prerequisites ?? []).includes(inspectingTopicId));

    // Diagnostic info
    const breakdown = grade.topic_breakdown.find(
      (b) => b.topic_id === inspectingTopicId || b.title === current?.title,
    );

    // Tested questions for this topic
    // Match questions whose source_page is in this topic's page_refs
    const tested = grade.graded_items.filter((item) =>
      current?.page_refs.some((ref) => item.source_page_number >= ref.start_page && item.source_page_number <= ref.end_page),
    );

    return {
      topic: current,
      masteryScore: breakdown?.mastery_score,
      rawAccuracy: breakdown?.raw_accuracy,
      vulnerabilityScore: breakdown?.vulnerability_score,
      isFlaggedWeak: breakdown?.is_flagged_weak,
      trappedMisconceptions: breakdown?.trapped_misconceptions,
      prerequisiteTopics: prereqs,
      dependentTopics: dependents,
      testedQuestions: tested,
    };
  }, [inspectingTopicId, topicsById, topicsByTitle, topics, grade]);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Diagnosis & Knowledge Network</div>
          <h1>The exam knew which kind of wrong you were.</h1>
          <p className="lede">
            Same score, different problem. A confident error is a misconception to unlearn; a hesitant error is a gap
            to fill. Explore the knowledge graph below to see where misconceptions cascaded.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="session-chip">
            <span className="dot warn" aria-hidden="true" /> {weak.length} weak topic{weak.length === 1 ? "" : "s"} flagged
          </span>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <div className="label">Raw accuracy</div>
          <div className="value">{pct(grade.summary.raw_accuracy)}</div>
          <div className="sub">correct answers</div>
        </div>
        <div className="stat">
          <div className="label">Mastery</div>
          <div className="value">{pct(grade.summary.mastery_score)}</div>
          <div className="sub">penalised by misconception weight</div>
        </div>
        <div className="stat">
          <div className="label">Calibration error</div>
          <div className="value">{grade.summary.mce_score.toFixed(2)}</div>
          <div className="sub">lower is better</div>
        </div>
        <div className="stat">
          <div className="label">Lure persistence</div>
          <div className="value">{pct(grade.summary.lure_persistence_rate)}</div>
          <div className="sub">misconceptions still active</div>
        </div>
      </div>

      {/* Notion-Style Multi-View Database Switcher: Diagnosis Matrix vs Notion Kanban Board vs Obsidian Knowledge Graph */}
      <div className="row mt-16" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`btn small ${activeTab === "diagnosis" ? "primary" : ""}`}
            onClick={() => setActiveTab("diagnosis")}
          >
            📊 Metacognitive Matrix &amp; Table
          </button>
          <button
            className={`btn small ${activeTab === "board" ? "primary" : ""}`}
            onClick={() => setActiveTab("board")}
          >
            📋 Mastery Board (Notion Kanban)
          </button>
          <button
            className={`btn small ${activeTab === "graph" ? "primary" : ""}`}
            onClick={() => setActiveTab("graph")}
          >
            🌐 Knowledge Graph (Obsidian View)
          </button>
        </div>
        <span className="small muted">
          {topics.length > 0 ? `${topics.length} topics mapped with live diagnostic status` : ""}
        </span>
      </div>

      {activeTab === "board" && (
        <section className="panel mt-16" aria-labelledby="notion-board-heading">
          <div className="panel-head">
            <div>
              <h2 id="notion-board-heading">Notion-Style Mastery Progression Board</h2>
              <span className="hint">
                Interactive Kanban workflow &middot; Group by topics or question diagnostic states &middot; Rollups &amp; properties
              </span>
            </div>
          </div>
          <MasteryBoard
            grade={grade}
            exam={exam}
            topics={topics}
            onInspectTopic={(id) => setInspectingTopicId(id)}
            onOpenQuote={onOpenQuote}
          />
        </section>
      )}

      {activeTab === "graph" && topics.length > 0 && (
        <section className="panel mt-16" aria-labelledby="knowledge-mastery-heading">
          <div className="panel-head">
            <h2 id="knowledge-mastery-heading">Knowledge Mastery Network</h2>
            <span className="hint">
              Green = Mastered &middot; Amber = Fragile &middot; Red = Lure Entrapment &middot; Click any node to inspect
              backlinks
            </span>
          </div>
          <KnowledgeGraph
            topics={topics}
            mastery={masteryMap}
            selectedTopicId={inspectingTopicId}
            onSelectTopic={(id) => setInspectingTopicId(id)}
          />
        </section>
      )}

      {activeTab === "diagnosis" && (
        <div className="grid-2 mt-16">
          <section className="panel" aria-labelledby="matrix-heading">
            <div className="panel-head">
              <h2 id="matrix-heading">Answer quality</h2>
              <span className="hint">confidence x correctness</span>
            </div>
            <div className="matrix">
              <div className="matrix-axis-y" aria-hidden="true">
                confidence
              </div>
              <div className="matrix-grid">
                <div className="quad" data-tone="ok">
                  <div className="q-label">Confident + correct</div>
                  <div className="q-count">{counts.MASTERED ?? 0}</div>
                  <div className="q-desc">Mastered</div>
                </div>
                <div className="quad" data-tone="bad">
                  <div className="q-label">Confident + wrong</div>
                  <div className="q-count">{counts.LURE_ENTRAPMENT ?? 0}</div>
                  <div className="q-desc">Lure entrapment</div>
                </div>
                <div className="quad" data-tone="warn">
                  <div className="q-label">Guessing + correct</div>
                  <div className="q-count">{counts.FRAGILE_GUESS ?? 0}</div>
                  <div className="q-desc">Fragile guess</div>
                </div>
                <div className="quad" data-tone="warn">
                  <div className="q-label">Guessing + wrong</div>
                  <div className="q-count">{counts.RECOGNIZED_GAP ?? 0}</div>
                  <div className="q-desc">Recognised gap</div>
                </div>
              </div>
              <div className="spacer" />
              <div className="matrix-x">
                <span>correct</span>
                <span>incorrect</span>
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="topics-heading">
            <div className="panel-head">
              <h2 id="topics-heading">Topic mastery</h2>
              <span className="hint">ranked by vulnerability</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th className="num">Mastery</th>
                  <th className="num">Risk</th>
                </tr>
              </thead>
              <tbody>
                {grade.topic_breakdown.map((topic) => (
                  <tr
                    key={topic.topic_id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setInspectingTopicId(topic.topic_id)}
                  >
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <span>{topic.title}</span>
                        <button
                          className="btn ghost small"
                          style={{ padding: "0 4px", fontSize: "0.72rem" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingTopicId(topic.topic_id);
                          }}
                        >
                          Backlinks ↗
                        </button>
                      </div>
                      {topic.is_flagged_weak ? (
                        <span className="badge weak">flagged weak</span>
                      ) : (
                        <span className="badge ok">stable</span>
                      )}
                      {topic.trapped_misconceptions.length > 0 && (
                        <div className="topic-meta mono">{topic.trapped_misconceptions.join(", ")}</div>
                      )}
                    </td>
                    <td className="num">
                      <div className="meter" aria-hidden="true">
                        <span
                          className={topic.mastery_score < 0.6 ? "low" : ""}
                          style={{ width: `${Math.round(topic.mastery_score * 100)}%` }}
                        />
                      </div>
                      <div style={{ marginTop: 4 }}>{pct(topic.mastery_score)}</div>
                    </td>
                    <td className="num">{topic.vulnerability_score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* Dataview-Style Filter & Review Section */}
      <section className="panel mt-16" aria-labelledby="review-heading">
        <div className="panel-head">
          <div>
            <h2 id="review-heading">Item by Item Diagnostic Explorer</h2>
            <span className="hint">Query by misconception state or keyword &middot; view source citations</span>
          </div>
          <span className="small muted">
            Showing {filteredItems.length} of {grade.graded_items.length} items
          </span>
        </div>

        {/* Filter bar */}
        <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <div className="row" style={{ gap: 4 }}>
            <span className="small muted">Filter:</span>
            <button
              className={`btn small ${itemFilter === "ALL" ? "primary" : ""}`}
              onClick={() => setItemFilter("ALL")}
              style={{ padding: "3px 8px", fontSize: "0.78rem" }}
            >
              All
            </button>
            <button
              className={`btn small ${itemFilter === "LURE_ENTRAPMENT" ? "primary" : ""}`}
              onClick={() => setItemFilter("LURE_ENTRAPMENT")}
              style={{ padding: "3px 8px", fontSize: "0.78rem" }}
            >
              Lures Only ({counts.LURE_ENTRAPMENT ?? 0})
            </button>
            <button
              className={`btn small ${itemFilter === "FRAGILE_GUESS" ? "primary" : ""}`}
              onClick={() => setItemFilter("FRAGILE_GUESS")}
              style={{ padding: "3px 8px", fontSize: "0.78rem" }}
            >
              Fragile ({counts.FRAGILE_GUESS ?? 0})
            </button>
            <button
              className={`btn small ${itemFilter === "MASTERED" ? "primary" : ""}`}
              onClick={() => setItemFilter("MASTERED")}
              style={{ padding: "3px 8px", fontSize: "0.78rem" }}
            >
              Mastered ({counts.MASTERED ?? 0})
            </button>
          </div>

          <div style={{ marginLeft: "auto", minWidth: 200 }}>
            <input
              type="search"
              placeholder="Search stem or quote..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "5px 10px",
                borderRadius: "var(--radius)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                fontSize: "0.82rem",
                color: "var(--ink)",
              }}
            />
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="small muted" style={{ padding: "20px 0", textAlign: "center" }}>
            No questions match the current filter or search query.
          </div>
        ) : (
          filteredItems.map((item) => {
            const options = optionsById.get(item.question_id);
            const right = options?.get(item.correct_option_id) ?? item.correct_option_id;
            const chosen = options?.get(item.selected_option_id) ?? item.selected_option_text;

            // Find matching topic for this item
            const matchingTopic = topics.find((t) =>
              t.page_refs.some((r) => item.source_page_number >= r.start_page && item.source_page_number <= r.end_page),
            );

            return (
              <article className="review-item" key={item.question_id}>
                <div className="review-stem">{item.stem}</div>
                <div className="review-meta">
                  <span className={`badge ${STATE_TONE[item.diagnostic_state] ?? ""}`}>
                    {STATE_LABEL[item.diagnostic_state] ?? item.diagnostic_state}
                  </span>
                  <span>page {item.source_page_number}</span>
                  {matchingTopic && (
                    <button
                      className="btn ghost small"
                      onClick={() => setInspectingTopicId(matchingTopic.topic_id)}
                      title="Inspect topic backlinks"
                    >
                      Topic: {matchingTopic.code} {matchingTopic.title} ↗
                    </button>
                  )}
                  {item.endorsed_misconception && (
                    <span>
                      misconception <span className="mono">{item.endorsed_misconception}</span>
                    </span>
                  )}
                  <button
                    className="btn ghost small"
                    onClick={() => onOpenQuote(item.source_page_number, item.verbatim_source_quote)}
                  >
                    Open source
                  </button>
                </div>
                <div className="review-answer">
                  Your answer:{" "}
                  {item.is_correct ? (
                    <span className="right">{chosen}</span>
                  ) : (
                    <span className="wrong">
                      <s>{chosen}</s>
                    </span>
                  )}
                  {!item.is_correct && (
                    <>
                      {" "}
                      &middot; Correct: <span className="right">{right}</span>
                      {item.endorsed_misconception && (
                        <div className="small" style={{ marginTop: 4, color: "var(--danger)" }}>
                          Struck because it tests the <span className="mono">{item.endorsed_misconception}</span> trap —
                          the source quote below says otherwise.
                        </div>
                      )}
                    </>
                  )}
                </div>
                <p className="quote">&ldquo;{item.verbatim_source_quote}&rdquo;</p>
              </article>
            );
          })
        )}
      </section>

      <div className="panel mt-16">
        <div className="row">
          <div>
            <h2>Repair the weak topics, then retest.</h2>
            <p className="small muted" style={{ marginTop: 4 }}>
              {weak.length > 0
                ? `Remediation focuses on ${weak.map((topic) => topic.title).join(", ")}. The retest uses new questions on the same ideas.`
                : "No topic fell below the mastery threshold. Retake the exam to confirm stability."}
            </p>
          </div>
          <span className="spacer" />
          <button className="btn primary" onClick={onRemediate} disabled={busy || weak.length === 0}>
            Build remediation and retest
          </button>
        </div>
      </div>

      {inspectorData && (
        <BacklinksDrawer
          data={inspectorData}
          onClose={() => setInspectingTopicId(null)}
          onSelectTopic={(id) => setInspectingTopicId(id)}
          onOpenQuote={(page, quote) => onOpenQuote(page, quote)}
        />
      )}
    </>
  );
}
