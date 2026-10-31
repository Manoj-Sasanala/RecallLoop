import { useState } from "react";
import type { RemediationCard, RemediationPlan } from "../types";

function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <div className="notion-block-body">
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}

export function Remediation({
  plan,
  busy,
  onRetest,
  onOpenQuote,
}: {
  plan: RemediationPlan;
  busy: boolean;
  onRetest: () => void;
  onOpenQuote?: (page: number, quote: string) => void;
}) {
  const lures = plan.remediation_cards.filter((c) => c.trapped_misconception).length;

  // Track interactive self-checks for active recall (Notion To-Do Block pattern)
  const [checkedCards, setCheckedCards] = useState<Record<string, { understood: boolean; verified: boolean }>>({});

  const toggleCheck = (topicId: string, field: "understood" | "verified") => {
    setCheckedCards((prev) => ({
      ...prev,
      [topicId]: {
        understood: prev[topicId]?.understood ?? false,
        verified: prev[topicId]?.verified ?? false,
        [field]: !(prev[topicId]?.[field] ?? false),
      },
    }));
  };

  // Track accordion toggles (Notion Toggle List pattern)
  const [openToggles, setOpenToggles] = useState<Record<string, boolean>>({});

  const toggleAccordion = (key: string) => {
    setOpenToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Calculate readiness rollup
  const totalChecks = plan.remediation_cards.length * 2;
  const completedChecks = plan.remediation_cards.reduce((sum, c) => {
    const s = checkedCards[c.topic_id];
    let count = 0;
    if (s?.understood) count++;
    if (s?.verified) count++;
    return sum + count;
  }, 0);
  const readinessPct = totalChecks > 0 ? Math.round((completedChecks / totalChecks) * 100) : 0;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Interactive Block Remediation</div>
          <h1>Target the misconception, not the topic.</h1>
          <p className="lede">
            Active recall requires confronting the false model before reading the answer. Use the collapsible blocks below to
            test your understanding before proving it on new questions.
          </p>
        </div>
      </header>

      {/* Notion Database Header / Briefing with Live Progress Rollup */}
      <section className="panel" aria-labelledby="briefing-heading">
        <div className="panel-head">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: "1.2rem" }}>📋</span>
            <h2 id="briefing-heading">Remediation Briefing & Active Recall Progress</h2>
          </div>
          <span className="notion-prop-chip ok">
            {completedChecks} of {totalChecks} checks complete ({readinessPct}%)
          </span>
        </div>

        <p className="lede" style={{ maxWidth: "72ch", marginTop: 8 }}>
          {plan.remediation_cards.length} targeted weak topic{plan.remediation_cards.length === 1 ? "" : "s"}
          {lures > 0 ? (
            <>
              {" "}— {lures} confident wrong answer{lures === 1 ? "" : "s"}, representing entrenched misconceptions to unlearn.
            </>
          ) : (
            "— no confident errors, so this is fill-in work to reinforce knowledge."
          )}
        </p>

        {/* Notion Rollup Progress Bar */}
        <div className="notion-progress-rollup mt-16">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="small muted">Self-Verification Mastery Readiness</span>
            <span className="small mono">{readinessPct}%</span>
          </div>
          <div className="meter" style={{ height: 8 }}>
            <span
              className={readinessPct < 50 ? "low" : ""}
              style={{
                width: `${readinessPct}%`,
                backgroundColor: readinessPct >= 80 ? "#10b981" : readinessPct >= 50 ? "#eab308" : "#f59e0b",
              }}
            />
          </div>
        </div>
      </section>

      {/* Notion-Style Block Document Stack */}
      <div className="card-stack mt-16">
        {plan.remediation_cards.map((card: RemediationCard, idx: number) => {
          const cardChecks = checkedCards[card.topic_id] ?? { understood: false, verified: false };
          const isFullyVerified = cardChecks.understood && cardChecks.verified;
          const toggleExplKey = `${card.topic_id}_expl`;
          const toggleWorkKey = `${card.topic_id}_work`;
          const isExplOpen = openToggles[toggleExplKey] ?? true; // Open explanation by default
          const isWorkOpen = openToggles[toggleWorkKey] ?? false; // Worked example hidden by default for active retrieval!

          return (
            <article
              className={`notion-block-doc ${isFullyVerified ? "notion-block-verified" : ""}`}
              key={card.topic_id}
            >
              {/* Document Header & Notion Properties Ribbon */}
              <div className="notion-doc-header">
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="notion-doc-icon">📄</span>
                  <h2 className="notion-doc-title">
                    {idx + 1}. {card.topic_title}
                  </h2>
                  {card.trapped_misconception && (
                    <span className="badge weak">Misconception Trap</span>
                  )}
                  {isFullyVerified && (
                    <span className="badge ok">✓ Concept Cleared</span>
                  )}
                </div>

                {/* Notion Property Bar */}
                <div className="notion-properties-bar mt-8">
                  <div className="notion-prop-item">
                    <span className="prop-name">Source Location:</span>
                    <button
                      className="prop-value-btn"
                      onClick={() => onOpenQuote?.(card.source_page, card.source_truth_quote)}
                    >
                      📖 Page {card.source_page} ↗
                    </button>
                  </div>
                  {card.trapped_misconception && (
                    <div className="notion-prop-item">
                      <span className="prop-name">False Belief:</span>
                      <span className="prop-value mono">{card.trapped_misconception}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Block 1: Callout Block - The Cognitive Trap */}
              {card.trapped_misconception && (
                <div className="notion-callout-block warning">
                  <div className="callout-symbol">🚨</div>
                  <div className="callout-content">
                    <div className="callout-title">The Cognitive Trap (Why intuition deceived you)</div>
                    <p className="callout-body">
                      The distractor tested the belief that <em>"{card.trapped_misconception}"</em>. This feels intuitively
                      plausible, but contradicts the foundational mechanism documented in the text.
                    </p>
                  </div>
                </div>
              )}

              {/* Block 2: Source Quote & Ground Truth Reference */}
              <div className="notion-quote-block">
                <div className="quote-text">&ldquo;{card.source_truth_quote}&rdquo;</div>
                {card.page_image_b64 && (
                  <img
                    src={`data:image/png;base64,${card.page_image_b64}`}
                    alt={`Source diagram from page ${card.source_page}`}
                    style={{ maxWidth: "100%", border: "1px solid var(--line)", borderRadius: "var(--radius)", marginTop: 8 }}
                  />
                )}
                <div className="quote-meta">
                  <span className="source-tag">Verbatim Ground Truth</span>
                  <button
                    className="btn ghost small"
                    style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                    onClick={() => onOpenQuote?.(card.source_page, card.source_truth_quote)}
                  >
                    View Page {card.source_page} in Document ↗
                  </button>
                </div>
              </div>

              {/* Block 3: Toggle Block - Corrective Explanation */}
              <div className="notion-toggle-block">
                <button
                  className="notion-toggle-trigger"
                  onClick={() => toggleAccordion(toggleExplKey)}
                  aria-expanded={isExplOpen}
                >
                  <span className="notion-toggle-arrow">{isExplOpen ? "▼" : "▶"}</span>
                  <span className="notion-toggle-heading">💡 Core Principle & Corrective Logic</span>
                </button>
                {isExplOpen && (
                  <div className="notion-toggle-content">
                    <Md text={card.corrective_explanation_md} />
                  </div>
                )}
              </div>

              {/* Block 4: Toggle Block - Worked Example (Hidden by default for Active Recall Practice) */}
              <div className="notion-toggle-block">
                <button
                  className="notion-toggle-trigger"
                  onClick={() => toggleAccordion(toggleWorkKey)}
                  aria-expanded={isWorkOpen}
                >
                  <span className="notion-toggle-arrow">{isWorkOpen ? "▼" : "▶"}</span>
                  <span className="notion-toggle-heading">
                    🔍 Step-by-Step Worked Example &amp; Resolution
                    {!isWorkOpen && <span className="hint-pill">Click to reveal &amp; self-check</span>}
                  </span>
                </button>
                {isWorkOpen && (
                  <div className="notion-toggle-content">
                    <Md text={card.worked_example_md} />
                  </div>
                )}
              </div>

              {/* Block 5: Interactive Self-Check Block (Notion To-Do Block) */}
              <div className="notion-todo-block">
                <div className="todo-heading">Active Recall Verification:</div>
                <div className="todo-items">
                  <label className="notion-checkbox-row">
                    <input
                      type="checkbox"
                      checked={cardChecks.understood}
                      onChange={() => toggleCheck(card.topic_id, "understood")}
                    />
                    <span className={cardChecks.understood ? "checked-text" : ""}>
                      I can state the true principle and explain why the trap was false.
                    </span>
                  </label>
                  <label className="notion-checkbox-row">
                    <input
                      type="checkbox"
                      checked={cardChecks.verified}
                      onChange={() => toggleCheck(card.topic_id, "verified")}
                    />
                    <span className={cardChecks.verified ? "checked-text" : ""}>
                      I have examined the source quote and worked through the resolution.
                    </span>
                  </label>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Retest Action Bar — Close-and-Recall gate: prove recall before retesting */}
      <div className="panel mt-16">
        <div className="row" style={{ alignItems: "center" }}>
          <div>
            <h2>Prove it on new questions.</h2>
            <p className="small muted" style={{ marginTop: 4 }}>
              {plan.retest_questions.length} targeted items on the flagged topics. Same underlying rules, unfamiliar stems.
              {completedChecks < totalChecks && (
                <>
                  {" "}
                  Check both boxes on every card above ({completedChecks}/{totalChecks} done) to unlock the retest —
                  recall first, then prove it.
                </>
              )}
            </p>
          </div>
          <span className="spacer" />
          <button
            className="btn primary"
            onClick={onRetest}
            disabled={busy || completedChecks < totalChecks}
            title={completedChecks < totalChecks ? "Complete the self-checks above first" : undefined}
          >
            {busy ? "Preparing retest..." : "Start targeted retest"}
          </button>
        </div>
      </div>
    </>
  );
}
