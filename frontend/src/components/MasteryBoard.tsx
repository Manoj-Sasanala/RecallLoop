import { useMemo, useState } from "react";
import type { Exam, GradedItem, GradeResult, Topic, TopicResult } from "../types";

export type BoardCardTopic = {
  kind: "topic";
  topicId: string;
  code: string;
  title: string;
  weight: number;
  allocatedQuestions: number;
  pages: string;
  startPage: number;
  masteryScore: number;
  rawAccuracy: number;
  vulnerabilityScore: number;
  isFlaggedWeak: boolean;
  misconceptions: string[];
  prereqCount: number;
  state: "LURE_ENTRAPMENT" | "RECOGNIZED_GAP" | "FRAGILE" | "MASTERED";
};

export type BoardCardItem = {
  kind: "item";
  questionId: string;
  itemIndex: number;
  stem: string;
  sourcePage: number;
  sourceQuote: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  diagnosticState: string;
  misconception: string | null;
  rationale: string;
};

type ColumnKey = "LURE_ENTRAPMENT" | "RECOGNIZED_GAP" | "FRAGILE" | "MASTERED";

const COLUMN_CONFIG: Record<
  ColumnKey,
  { label: string; icon: string; badgeClass: string; color: string; description: string }
> = {
  LURE_ENTRAPMENT: {
    label: "Lure Entrapment",
    icon: "🚨",
    badgeClass: "weak",
    color: "#ef4444",
    description: "High confidence + incorrect. Active misconceptions to unlearn.",
  },
  RECOGNIZED_GAP: {
    label: "Recognized Gap",
    icon: "⚠️",
    badgeClass: "warn",
    color: "#f59e0b",
    description: "Low confidence + incorrect. Missing knowledge to acquire.",
  },
  FRAGILE: {
    label: "Fragile Retention",
    icon: "⚡",
    badgeClass: "warn",
    color: "#eab308",
    description: "Low confidence + correct. Lucky guesses needing reinforcement.",
  },
  MASTERED: {
    label: "Mastered",
    icon: "✅",
    badgeClass: "ok",
    color: "#10b981",
    description: "High confidence + correct. Rock-solid understanding.",
  },
};

const pct = (val: number) => `${Math.round(val * 100)}%`;

export function MasteryBoard({
  grade,
  exam,
  topics = [],
  onInspectTopic,
  onOpenQuote,
}: {
  grade: GradeResult;
  exam?: Exam;
  topics?: Topic[];
  onInspectTopic?: (topicId: string) => void;
  onOpenQuote?: (page: number, quote: string) => void;
}) {
  const [groupBy, setGroupBy] = useState<"topics" | "items">("topics");
  const [filterQuery, setFilterQuery] = useState("");
  const [selectedWeight, setSelectedWeight] = useState<string>("ALL");

  const topicsById = useMemo(() => new Map(topics.map((t) => [t.topic_id, t])), [topics]);

  const optionsById = useMemo(() => {
    if (!exam) return new Map<string, Map<string, string>>();
    return new Map(
      exam.questions.map((question) => [
        question.question_id,
        new Map(question.options.map((option) => [option.option_id, option.text])),
      ]),
    );
  }, [exam]);

  // Topic Breakdown Cards
  const topicCards = useMemo<BoardCardTopic[]>(() => {
    return grade.topic_breakdown.map((tb: TopicResult) => {
      const topic = topicsById.get(tb.topic_id) || topics.find((t) => t.title === tb.title);
      const startPage = topic?.page_refs[0]?.start_page ?? 1;
      const endPage = topic?.page_refs[0]?.end_page ?? startPage;
      const pages = endPage > startPage ? `pp. ${startPage}-${endPage}` : `p. ${startPage}`;

      // Assign diagnostic state based on cognitive severity
      let state: ColumnKey = "MASTERED";
      if (tb.trapped_misconceptions.length > 0) {
        state = "LURE_ENTRAPMENT";
      } else if (tb.is_flagged_weak || tb.mastery_score < 0.6) {
        state = "RECOGNIZED_GAP";
      } else if (tb.mastery_score < 0.8 || tb.vulnerability_score > 0.4) {
        state = "FRAGILE";
      }

      return {
        kind: "topic",
        topicId: tb.topic_id,
        code: topic?.code ?? "TOPIC",
        title: tb.title,
        weight: topic?.syllabus_weight ?? 1,
        allocatedQuestions: topic?.allocated_questions ?? 0,
        pages,
        startPage,
        masteryScore: tb.mastery_score,
        rawAccuracy: tb.raw_accuracy,
        vulnerabilityScore: tb.vulnerability_score,
        isFlaggedWeak: tb.is_flagged_weak,
        misconceptions: tb.trapped_misconceptions,
        prereqCount: topic?.prerequisites?.length ?? 0,
        state,
      };
    });
  }, [grade.topic_breakdown, topics, topicsById]);

  // Item Cards
  const itemCards = useMemo<BoardCardItem[]>(() => {
    return grade.graded_items.map((item: GradedItem, idx: number) => {
      const correctText =
        optionsById.get(item.question_id)?.get(item.correct_option_id) || item.correct_option_id;

      return {
        kind: "item",
        questionId: item.question_id,
        itemIndex: idx,
        stem: item.stem,
        sourcePage: item.source_page_number,
        sourceQuote: item.verbatim_source_quote,
        userAnswer: item.selected_option_text,
        correctAnswer: correctText,
        isCorrect: item.is_correct,
        diagnosticState: item.diagnostic_state,
        misconception: item.endorsed_misconception,
        rationale: item.rationale,
      };
    });
  }, [grade.graded_items, optionsById]);

  // Filtered Cards
  const query = filterQuery.toLowerCase().trim();

  const filteredTopicCards = useMemo(() => {
    return topicCards.filter((c) => {
      if (selectedWeight !== "ALL") {
        if (selectedWeight === "HIGH" && c.weight < 1.2) return false;
        if (selectedWeight === "STANDARD" && (c.weight < 0.8 || c.weight >= 1.2)) return false;
        if (selectedWeight === "LOW" && c.weight >= 0.8) return false;
      }
      if (query) {
        const matchTitle = c.title.toLowerCase().includes(query);
        const matchCode = c.code.toLowerCase().includes(query);
        const matchMisc = c.misconceptions.some((m) => m.toLowerCase().includes(query));
        if (!matchTitle && !matchCode && !matchMisc) return false;
      }
      return true;
    });
  }, [topicCards, selectedWeight, query]);

  const filteredItemCards = useMemo(() => {
    return itemCards.filter((c) => {
      if (query) {
        const matchStem = c.stem.toLowerCase().includes(query);
        const matchQuote = c.sourceQuote.toLowerCase().includes(query);
        const matchMisc = c.misconception?.toLowerCase().includes(query);
        if (!matchStem && !matchQuote && !matchMisc) return false;
      }
      return true;
    });
  }, [itemCards, query]);

  // Group columns
  const columns: ColumnKey[] = ["LURE_ENTRAPMENT", "RECOGNIZED_GAP", "FRAGILE", "MASTERED"];

  return (
    <div className="notion-board-container">
      {/* Notion Database Toolbar */}
      <div className="notion-board-toolbar">
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="notion-view-selector">
            <span className="notion-label">Group by:</span>
            <div className="btn-group">
              <button
                className={`btn small ${groupBy === "topics" ? "primary" : ""}`}
                onClick={() => setGroupBy("topics")}
              >
                📚 Topics ({grade.topic_breakdown.length})
              </button>
              <button
                className={`btn small ${groupBy === "items" ? "primary" : ""}`}
                onClick={() => setGroupBy("items")}
              >
                ❓ Questions ({grade.graded_items.length})
              </button>
            </div>
          </div>

          {groupBy === "topics" && (
            <div className="row" style={{ gap: 4, alignItems: "center" }}>
              <span className="notion-label">Syllabus Weight:</span>
              <select
                value={selectedWeight}
                onChange={(e) => setSelectedWeight(e.target.value)}
                className="notion-select"
              >
                <option value="ALL">All Weights</option>
                <option value="HIGH">High Weight (&ge; 1.2x)</option>
                <option value="STANDARD">Standard (0.8x - 1.2x)</option>
                <option value="LOW">Low Weight (&lt; 0.8x)</option>
              </select>
            </div>
          )}

          <div style={{ marginLeft: "auto", minWidth: 200 }}>
            <input
              type="search"
              placeholder={groupBy === "topics" ? "Search topics & misconceptions..." : "Search question stems & quotes..."}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="notion-search-input"
            />
          </div>
        </div>
      </div>

      {/* Notion Kanban Columns Grid */}
      <div className="notion-columns-track">
        {columns.map((colKey) => {
          const col = COLUMN_CONFIG[colKey];
          const cardsInCol =
            groupBy === "topics"
              ? filteredTopicCards.filter((c) => c.state === colKey)
              : filteredItemCards.filter((c) => {
                  if (colKey === "FRAGILE") return c.diagnosticState === "FRAGILE_GUESS";
                  return c.diagnosticState === colKey;
                });

          // Rollup calculations
          const avgScore =
            groupBy === "topics"
              ? cardsInCol.length > 0
                ? pct(
                    (cardsInCol as BoardCardTopic[]).reduce((acc, c) => acc + c.masteryScore, 0) / cardsInCol.length
                  )
                : "--"
              : cardsInCol.length > 0
              ? `${Math.round(
                  ((cardsInCol as BoardCardItem[]).filter((c) => c.isCorrect).length / cardsInCol.length) * 100
                )}% correct`
              : "--";

          return (
            <div className="notion-column" key={colKey}>
              {/* Column Header */}
              <div className="notion-column-header">
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <span className="notion-col-icon">{col.icon}</span>
                  <span className="notion-col-title">{col.label}</span>
                  <span className="notion-col-count">{cardsInCol.length}</span>
                </div>
                <div className="notion-col-rollup">{avgScore}</div>
              </div>

              <div className="notion-col-desc">{col.description}</div>

              {/* Cards List */}
              <div className="notion-card-list">
                {cardsInCol.length === 0 ? (
                  <div className="notion-card-empty">No items in this status</div>
                ) : (
                  cardsInCol.map((card) => {
                    if (card.kind === "topic") {
                      return (
                        <div
                          key={card.topicId}
                          className="notion-card notion-card-topic"
                          onClick={() => onInspectTopic?.(card.topicId)}
                        >
                          <div className="notion-card-title-row">
                            <span className="notion-card-title">{card.title}</span>
                            {onInspectTopic && (
                              <button
                                className="btn ghost small notion-card-action"
                                title="Inspect topic backlinks"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onInspectTopic(card.topicId);
                                }}
                              >
                                ↗
                              </button>
                            )}
                          </div>

                          {/* Notion Properties Strip */}
                          <div className="notion-props-strip">
                            <span className="notion-prop-chip page-chip">
                              📖 {card.pages}
                            </span>
                            <span className="notion-prop-chip mono">
                              {card.code}
                            </span>
                            {card.prereqCount > 0 && (
                              <span className="notion-prop-chip prereq-chip">
                                🔗 {card.prereqCount} prereqs
                              </span>
                            )}
                          </div>

                          {/* Progress Meter */}
                          <div className="notion-meter-container">
                            <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}>
                              <span className="small muted">Mastery</span>
                              <span className="small mono">{pct(card.masteryScore)}</span>
                            </div>
                            <div className="meter" style={{ height: 6 }}>
                              <span
                                className={card.masteryScore < 0.6 ? "low" : ""}
                                style={{ width: `${Math.round(card.masteryScore * 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* Misconceptions Callout */}
                          {card.misconceptions.length > 0 && (
                            <div className="notion-card-callout">
                              <span className="callout-icon">⚠️</span>
                              <div className="callout-text">
                                <span className="small mono">{card.misconceptions.join(", ")}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      // Question Item Card
                      return (
                        <div key={card.questionId} className="notion-card notion-card-item">
                          <div className="notion-card-title-row">
                            <span className="notion-item-num">Q{card.itemIndex + 1}</span>
                            <span className={`badge ${card.isCorrect ? "ok" : "weak"}`} style={{ fontSize: "0.7rem", padding: "1px 6px" }}>
                              {card.isCorrect ? "Correct" : "Incorrect"}
                            </span>
                          </div>

                          <p className="notion-stem-preview">{card.stem}</p>

                          {/* User vs Correct Answer */}
                          <div className="notion-answer-diff">
                            <div className={`answer-row ${card.isCorrect ? "correct" : "wrong"}`}>
                              <span className="answer-tag">You:</span>
                              <span className="answer-text">{card.userAnswer}</span>
                            </div>
                            {!card.isCorrect && (
                              <div className="answer-row correct">
                                <span className="answer-tag">Truth:</span>
                                <span className="answer-text">{card.correctAnswer}</span>
                              </div>
                            )}
                          </div>

                          {/* Endorsed Misconception */}
                          {card.misconception && (
                            <div className="notion-card-callout">
                              <span className="callout-icon">🪤</span>
                              <div className="callout-text">
                                <strong>Lure: </strong>
                                <span>{card.misconception}</span>
                              </div>
                            </div>
                          )}

                          {/* Source Quote Button */}
                          {onOpenQuote && card.sourceQuote && (
                            <div className="notion-quote-trigger mt-8">
                              <button
                                className="btn ghost small"
                                style={{ fontSize: "0.74rem", padding: "2px 6px" }}
                                onClick={() => onOpenQuote(card.sourcePage, card.sourceQuote)}
                              >
                                📜 View quote in p.{card.sourcePage} ↗
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
