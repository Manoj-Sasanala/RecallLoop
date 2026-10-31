import type { Delta } from "../types";

const pts = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)} pts`;

export function DeltaView({ delta, mode, onRestart }: { delta: Delta; mode: "demo" | "uploaded"; onRestart: () => void }) {
  const first = delta.rounds[0];
  const last = delta.rounds[delta.rounds.length - 1];
  const masteryDelta = last.mastery_score - first.mastery_score;
  const accuracyDelta = last.raw_accuracy - first.raw_accuracy;
  const calibrationDelta = last.mce_score - first.mce_score;

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Before / after</div>
          <h1>{masteryDelta >= 0 ? "The gap closed." : "The gap did not close."}</h1>
          <p className="lede">
            Round one diagnosed the misconception. Round two measured the same ideas with new questions. The delta is
            the only claim that matters.
          </p>
        </div>
        <span className="session-chip">
          <span className="dot" aria-hidden="true" /> {delta.rounds.length} graded rounds
        </span>
      </header>

      <div className="stats">
        <div className="stat">
          <div className="label">Mastery change</div>
          <div className="value">{pts(masteryDelta)}</div>
          <div className="sub">
            {Math.round(first.mastery_score * 100)}% to {Math.round(last.mastery_score * 100)}%
          </div>
        </div>
        <div className="stat">
          <div className="label">Accuracy change</div>
          <div className="value">{pts(accuracyDelta)}</div>
          <div className="sub">
            {Math.round(first.raw_accuracy * 100)}% to {Math.round(last.raw_accuracy * 100)}%
          </div>
        </div>
        <div className="stat">
          <div className="label">Calibration</div>
          <div className="value">{calibrationDelta <= 0 ? "tighter" : "looser"}</div>
          <div className="sub">error {first.mce_score.toFixed(2)} to {last.mce_score.toFixed(2)}</div>
        </div>
        <div className="stat">
          <div className="label">Lures resolved</div>
          <div className="value">{Math.round(delta.lure_resolution_rate * 100)}%</div>
          <div className="sub">of exposed misconceptions</div>
        </div>
      </div>

      <div className="grid-2 mt-16">
        <section className="panel" aria-labelledby="rounds-heading">
          <div className="panel-head">
            <h2 id="rounds-heading">Mastery by round</h2>
            <span className="hint">deterministic, same engine</span>
          </div>
          <div className="rounds">
            {delta.rounds.map((round) => (
              <div className="round-row" key={round.exam_attempt_id}>
                <span className="round-label">ROUND {round.round_number}</span>
                <div className="bar" aria-hidden="true">
                  <span
                    className={round.round_number === 1 ? "before" : ""}
                    style={{ width: `${Math.round(round.mastery_score * 100)}%` }}
                  />
                </div>
                <span className="num-right">{Math.round(round.mastery_score * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="small muted mt-16">
            Mastery = 1 - mean deficit weight. A confident wrong answer costs a full point, so removing a lure moves the
            score more than guessing better.
          </p>
        </section>

        <section className="panel" aria-labelledby="delta-heading">
          <div className="panel-head">
            <h2 id="delta-heading">Topic movement</h2>
            <span className="hint">initial to retest</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Topic</th>
                <th className="num">Before</th>
                <th className="num">After</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {delta.topic_deltas.map((topic) => (
                <tr key={topic.topic_id}>
                  <td>{topic.title}</td>
                  <td className="num">{Math.round(topic.initial_mastery * 100)}%</td>
                  <td className="num">{Math.round(topic.retest_mastery * 100)}%</td>
                  <td className={`num ${topic.delta_mastery > 0 ? "delta-up" : "delta-flat"}`}>
                    {pts(topic.delta_mastery)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="panel mt-16">
        <div className="row">
          <div>
            <h2>Run it again on your own material.</h2>
            <p className="small muted" style={{ marginTop: 4 }}>
              {mode === "demo"
                ? "This was a seeded course. Upload a PDF to see the same loop on real material."
                : "Upload another chapter, or retake this one after the misconceptions settle."}
            </p>
          </div>
          <span className="spacer" />
          <button className="btn primary" onClick={onRestart}>
            Start a new session
          </button>
        </div>
      </div>
    </>
  );
}
