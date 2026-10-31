import type { Exam, GradeResult } from "../types";

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
  busy,
  onRemediate,
  onOpenQuote,
}: {
  grade: GradeResult;
  exam: Exam;
  busy: boolean;
  onRemediate: () => void;
  onOpenQuote: (page: number, quote: string) => void;
}) {
  const counts = grade.summary.state_counts;
  const weak = grade.topic_breakdown.filter((topic) => topic.is_flagged_weak);
  const optionsById = new Map(
    exam.questions.map((question) => [
      question.question_id,
      new Map(question.options.map((option) => [option.option_id, option.text])),
    ]),
  );

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Diagnosis</div>
          <h1>The exam knew which kind of wrong you were.</h1>
          <p className="lede">
            Same score, different problem. A confident error is a misconception to unlearn; a hesitant error is a gap
            to fill. The diagnosis picks the remedy.
          </p>
        </div>
        <span className="session-chip">
          <span className="dot warn" aria-hidden="true" /> {weak.length} weak topic{weak.length === 1 ? "" : "s"} flagged
        </span>
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
                <tr key={topic.topic_id}>
                  <td>
                    <div>{topic.title}</div>
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

      <section className="panel mt-16" aria-labelledby="review-heading">
        <div className="panel-head">
          <h2 id="review-heading">Item by item</h2>
          <span className="hint">every stem is tied to a source line</span>
        </div>
        {grade.graded_items.map((item) => {
          const options = optionsById.get(item.question_id);
          const right = options?.get(item.correct_option_id) ?? item.correct_option_id;
          const chosen = options?.get(item.selected_option_id) ?? item.selected_option_text;
          return (
            <article className="review-item" key={item.question_id}>
              <div className="review-stem">{item.stem}</div>
              <div className="review-meta">
                <span className={`badge ${STATE_TONE[item.diagnostic_state] ?? ""}`}>
                  {STATE_LABEL[item.diagnostic_state] ?? item.diagnostic_state}
                </span>
                <span>page {item.source_page_number}</span>
                {item.endorsed_misconception && (
                  <span>
                    misconception <span className="mono">{item.endorsed_misconception}</span>
                  </span>
                )}
                <button className="btn ghost small" onClick={() => onOpenQuote(item.source_page_number, item.verbatim_source_quote)}>
                  Open source
                </button>
              </div>
              <div className="review-answer">
                Your answer: <span className={item.is_correct ? "right" : "wrong"}>{chosen}</span>
                {!item.is_correct && (
                  <>
                    {" "}
                    &middot; Correct: <span className="right">{right}</span>
                  </>
                )}
              </div>
              <p className="quote">&ldquo;{item.verbatim_source_quote}&rdquo;</p>
            </article>
          );
        })}
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
    </>
  );
}
