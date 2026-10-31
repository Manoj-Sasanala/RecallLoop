import { useMemo, useState } from "react";
import type { Topic } from "../types";

// Prerequisite DAG, Obsidian-graph style: topics are nodes sized by exam
// weight, prerequisite edges are arrows. Hover isolates the neighborhood.
// Layout is layered by prerequisite depth: deterministic, no physics lib.
export function TopicGraph({ topics }: { topics: Topic[] }) {
  const [active, setActive] = useState<string | null>(null);
  const byId = useMemo(() => new Map(topics.map((t) => [t.topic_id, t])), [topics]);
  const pos = useMemo(() => layout(topics, byId), [topics, byId]);

  const neighbours = useMemo(() => {
    if (!active) return null;
    const keep = new Set([active]);
    for (const t of topics) {
      if (t.topic_id === active) (t.prerequisites ?? []).forEach((p) => keep.add(p));
      if ((t.prerequisites ?? []).includes(active)) keep.add(t.topic_id);
    }
    return keep;
  }, [active, topics]);

  const radius = (t: Topic) => 11 + t.syllabus_weight * 26;
  const boxH = [...pos.values()].reduce((m, p) => Math.max(m, p.y), 80) + 48;

  return (
    <div>
      <svg
        viewBox={`0 0 640 ${boxH}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Topic dependency graph"
        onMouseLeave={() => setActive(null)}
      >
        <defs>
          <marker id="rl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" />
          </marker>
        </defs>
        {topics.flatMap((t) =>
          (t.prerequisites ?? []).filter((p) => byId.has(p)).map((p) => {
            const a = pos.get(p)!;
            const b = pos.get(t.topic_id)!;
            const lit = active === null || p === active || t.topic_id === active;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ra = radius(byId.get(p)!) + 3;
            const rb = radius(t) + 10;
            return (
              <line
                key={`${p}-${t.topic_id}`}
                x1={a.x + (dx / len) * ra}
                y1={a.y + (dy / len) * ra}
                x2={b.x - (dx / len) * rb}
                y2={b.y - (dy / len) * rb}
                stroke="var(--line-strong)"
                strokeWidth={lit ? 1.8 : 1}
                opacity={lit ? 0.9 : 0.15}
                markerEnd="url(#rl-arrow)"
              />
            );
          }),
        )}
        {topics.map((t) => {
          const p = pos.get(t.topic_id)!;
          const dim = neighbours !== null && !neighbours.has(t.topic_id);
          const hub = t.out_degree > 0;
          const r = radius(t);
          return (
            <g
              key={t.topic_id}
              opacity={dim ? 0.25 : 1}
              onMouseEnter={() => setActive(t.topic_id)}
              style={{ cursor: "default" }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={active === t.topic_id ? r + 3 : r}
                fill={hub ? "var(--accent-soft)" : "var(--surface-2)"}
                stroke={hub ? "var(--accent)" : "var(--line-strong)"}
                strokeWidth={active === t.topic_id ? 2.5 : 1.5}
              />
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontFamily="var(--mono)" fill="var(--ink)">
                {t.code}
              </text>
              <text x={p.x} y={p.y + r + 16} textAnchor="middle" fontSize="11" fill="var(--ink-soft)">
                {t.title.length > 26 ? `${t.title.slice(0, 25)}…` : t.title}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="row small muted" style={{ marginTop: 8 }}>
        <span>
          <span className="dot" aria-hidden="true" /> unlocks later topics
        </span>
        <span>
          <span className="dot" aria-hidden="true" style={{ background: "var(--line-strong)" }} /> leaf topic
        </span>
        <span className="spacer" />
        <span>node size = exam weight &middot; hover isolates neighbours</span>
      </div>
    </div>
  );
}

function layout(topics: Topic[], byId: Map<string, Topic>) {
  const depthOf = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const t = byId.get(id);
    const prereqs = t?.prerequisites ?? [];
    if (!t || prereqs.length === 0) return 0;
    return 1 + Math.max(...prereqs.map((p) => depthOf(p, seen)));
  };
  const depths = new Map(topics.map((t) => [t.topic_id, depthOf(t.topic_id, new Set())]));
  const maxDepth = Math.max(0, ...depths.values());
  const columns = new Map<number, Topic[]>();
  for (const t of topics) {
    const d = depths.get(t.topic_id) ?? 0;
    if (!columns.has(d)) columns.set(d, []);
    columns.get(d)!.push(t);
  }
  const rowH = 84;
  const rows = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const W = 640;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, col] of columns) {
    const x = maxDepth === 0 ? W / 2 : 90 + (d / maxDepth) * (W - 180);
    col.forEach((t, i) => pos.set(t.topic_id, { x, y: 48 + i * rowH + ((rows - col.length) * rowH) / 2 }));
  }
  return pos;
}
