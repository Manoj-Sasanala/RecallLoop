import { useMemo, useState } from "react";
import type { Topic } from "../types";
import { BacklinksDrawer, type BacklinksDrawerData } from "./BacklinksDrawer";
import { KnowledgeGraph } from "./KnowledgeGraph";

export function Blueprint({
  topics,
  busy,
  onGenerate,
  onOpenQuote,
}: {
  topics: Topic[];
  busy: boolean;
  onGenerate: () => void;
  onOpenQuote?: (page: number, quote: string) => void;
}) {
  const [inspectingTopicId, setInspectingTopicId] = useState<string | null>(null);
  const totalQuestions = Math.min(10, Math.max(6, topics.length * 2));

  const byId = useMemo(() => new Map(topics.map((t) => [t.topic_id, t])), [topics]);

  const inspectorData = useMemo<BacklinksDrawerData | null>(() => {
    if (!inspectingTopicId) return null;
    const current = byId.get(inspectingTopicId);
    if (!current) return null;

    const prereqs = (current.prerequisites ?? []).map((id) => byId.get(id)).filter(Boolean) as Topic[];
    const dependents = topics.filter((t) => (t.prerequisites ?? []).includes(inspectingTopicId));

    // Page overlaps
    const coOccurring = topics.filter((t) => {
      if (t.topic_id === inspectingTopicId) return false;
      return t.page_refs.some((r1) =>
        current.page_refs.some(
          (r2) => r1.doc_id === r2.doc_id && Math.max(r1.start_page, r2.start_page) <= Math.min(r1.end_page, r2.end_page),
        ),
      );
    });

    return {
      topic: current,
      prerequisiteTopics: prereqs,
      dependentTopics: dependents,
      coOccurringTopics: coOccurring,
    };
  }, [inspectingTopicId, byId, topics]);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Blueprint</div>
          <h1>What the exam will cover.</h1>
          <p className="lede">
            Each topic is mapped to real pages. Weight comes from syllabus coverage, and dependency
            edges define the prerequisite sequence for deeper learning.
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="topics-heading">
        <div className="panel-head">
          <h2 id="topics-heading">{topics.length} topics mapped</h2>
          <span className="hint">Click any topic to explore its backlinks & citations</span>
        </div>

        <ul className="topic-list">
          {topics.map((topic) => (
            <li
              className="topic-row"
              key={topic.topic_id}
              style={{ cursor: "pointer" }}
              onClick={() => setInspectingTopicId(topic.topic_id)}
            >
              <span className="topic-code">{topic.code}</span>
              <div>
                <div className="topic-title">
                  {topic.title}
                  <button
                    className="btn ghost small"
                    style={{ marginLeft: 8, padding: "1px 6px", fontSize: "0.74rem" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInspectingTopicId(topic.topic_id);
                    }}
                  >
                    Inspect ↗
                  </button>
                </div>
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

      <section className="panel mt-16" aria-labelledby="graph-heading">
        <div className="panel-head">
          <h2 id="graph-heading">Knowledge Network Graph</h2>
          <span className="hint">Interactive Obsidian-style view &middot; drag nodes, hover to isolate</span>
        </div>
        <KnowledgeGraph
          topics={topics}
          selectedTopicId={inspectingTopicId}
          onSelectTopic={(id) => setInspectingTopicId(id)}
        />
      </section>

      {inspectorData && (
        <BacklinksDrawer
          data={inspectorData}
          onClose={() => setInspectingTopicId(null)}
          onSelectTopic={(id) => setInspectingTopicId(id)}
          onOpenQuote={(page, quote) => onOpenQuote?.(page, quote)}
        />
      )}
    </>
  );
}
