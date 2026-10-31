import type { Topic } from "../types";

export function Blueprint({
  topics,
  busy,
  onGenerate,
}: {
  topics: Topic[];
  busy: boolean;
  onGenerate: () => void;
}) {
  const totalQuestions = Math.min(10, Math.max(6, topics.length * 2));

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Blueprint</div>
          <h1>What the exam will cover.</h1>
          <p className="lede">
            Each topic is mapped to real pages. Weight comes from how much of the material it occupies, and dependency
            depth marks the ideas later topics rely on.
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="topics-heading">
        <div className="panel-head">
          <h2 id="topics-heading">{topics.length} topics</h2>
          <span className="hint">Questions cite a verbatim line from the source</span>
        </div>

        <ul className="topic-list">
          {topics.map((topic) => (
            <li className="topic-row" key={topic.topic_id}>
              <span className="topic-code">{topic.code}</span>
              <div>
                <div className="topic-title">{topic.title}</div>
                <div className="topic-meta">
                  pages{" "}
                  {topic.page_refs
                    .map((ref) => (ref.start_page === ref.end_page ? ref.start_page : `${ref.start_page}-${ref.end_page}`))
                    .join(", ")}
                  {topic.out_degree > 0 ? ` \u00b7 unlocks ${topic.out_degree} later topic${topic.out_degree > 1 ? "s" : ""}` : ""}
                </div>
              </div>
              <div>
                <div className="weight-track" aria-hidden="true">
                  <div className="weight-fill" style={{ width: `${Math.round(topic.syllabus_weight * 100)}%` }} />
                </div>
                <div className="topic-meta" style={{ marginTop: 4 }}>
                  exam weight
                </div>
              </div>
              <div className="num-right">{Math.round(topic.syllabus_weight * 100)}%</div>
            </li>
          ))}
        </ul>

        <div className="row mt-24">
          <button className="btn primary" onClick={onGenerate} disabled={busy}>
            Generate the diagnostic exam
          </button>
          <span className="small muted">
            {totalQuestions} questions &middot; 10 minutes &middot; confidence recorded per item
          </span>
        </div>
      </section>
    </>
  );
}
