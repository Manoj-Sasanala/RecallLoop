import type { RemediationPlan } from "../types";

function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <p className="rem-body">
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

export function Remediation({
  plan,
  busy,
  onRetest,
}: {
  plan: RemediationPlan;
  busy: boolean;
  onRetest: () => void;
}) {
  const lures = plan.remediation_cards.filter((c) => c.trapped_misconception).length;
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Remediation</div>
          <h1>Target the misconception, not the topic.</h1>
          <p className="lede">
            Each card names the wrong belief the distractor tested, quotes the line that contradicts it, and then sends
            you back into a new exam on the same ideas.
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="briefing-heading">
        <div className="panel-head">
          <h2 id="briefing-heading">Your briefing</h2>
          <span className="hint">read this first, then study the cards</span>
        </div>
        <p className="lede" style={{ maxWidth: "70ch" }}>
          {plan.remediation_cards.length} weak topic{plan.remediation_cards.length === 1 ? "" : "s"}
          {lures > 0 ? (
            <>
              {" "}— {lures} confident wrong answer{lures === 1 ? "" : "s"}, meaning {lures === 1 ? "a" : ""} misconception{lures === 1 ? "" : "s"} to unlearn, not just gaps to fill.{" "}
            </>
          ) : (
            "— no confident errors, so this is fill-in work, not unlearning. "
          )}
          Start with <strong>{plan.remediation_cards[0]?.topic_title}</strong>
          {plan.remediation_cards[0]?.trapped_misconception ? (
            <>
              {" "}(the <span className="mono">{plan.remediation_cards[0].trapped_misconception}</span> trap)
            </>
          ) : (
            ""
          )}
          , then prove it on {plan.retest_questions.length} new questions.
        </p>
      </section>

      <div className="card-stack mt-16">
        {plan.remediation_cards.map((card) => (
          <article className="rem-card" key={card.topic_id}>
            <div className="rem-head">
              <h2>{card.topic_title}</h2>
              {card.trapped_misconception && <span className="rem-tag">{card.trapped_misconception}</span>}
            </div>
            <p className="quote">
              &ldquo;{card.source_truth_quote}&rdquo; <span className="mono small">p.{card.source_page}</span>
            </p>
            <Md text={card.corrective_explanation_md} />
            <Md text={card.worked_example_md} />
          </article>
        ))}
      </div>

      <div className="panel mt-16">
        <div className="row">
          <div>
            <h2>Prove it on new questions.</h2>
            <p className="small muted" style={{ marginTop: 4 }}>
              {plan.retest_questions.length} targeted items on the flagged topics. Same rules, unfamiliar stems.
            </p>
          </div>
          <span className="spacer" />
          <button className="btn primary" onClick={onRetest} disabled={busy}>
            Start targeted retest
          </button>
        </div>
      </div>
    </>
  );
}
