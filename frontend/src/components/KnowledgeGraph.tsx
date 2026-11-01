import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Topic } from "../types";

export type TopicMasteryInfo = {
  mastery_score: number;
  is_flagged_weak: boolean;
  trapped_misconceptions?: string[];
  raw_accuracy?: number;
  vulnerability_score?: number;
};

type NodePosition = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
};

export function KnowledgeGraph({
  topics,
  mastery,
  selectedTopicId,
  onSelectTopic,
}: {
  topics: Topic[];
  mastery?: Map<string, TopicMasteryInfo>;
  selectedTopicId?: string | null;
  onSelectTopic?: (topicId: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "hubs" | "weak">("all");
  const [mode, setMode] = useState<"flow" | "organic">("flow");
  const [hovered, setHovered] = useState<string | null>(null);
  const [transform, setTransform] = useState<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number } | null>(null);

  const containerRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const byId = useMemo(() => new Map(topics.map((t) => [t.topic_id, t])), [topics]);

  // Filter topics
  const visibleTopics = useMemo(() => {
    return topics.filter((t) => {
      if (filter === "hubs") return t.out_degree > 0;
      if (filter === "weak") {
        const m = mastery?.get(t.topic_id);
        return m?.is_flagged_weak ?? false;
      }
      return true;
    });
  }, [topics, filter, mastery]);

  const visibleIds = useMemo(() => new Set(visibleTopics.map((t) => t.topic_id)), [visibleTopics]);

  // Initial layered layout
  const baseLayout = useMemo(() => computeLayeredLayout(topics, byId), [topics, byId]);

  // State of node positions
  const [positions, setPositions] = useState<Map<string, NodePosition>>(() => {
    const map = new Map<string, NodePosition>();
    for (const t of topics) {
      const p = baseLayout.get(t.topic_id) ?? { x: 320, y: 150 };
      map.set(t.topic_id, { id: t.topic_id, x: p.x, y: p.y, vx: 0, vy: 0 });
    }
    return map;
  });

  // Keep positions aligned if topics change or when switching to flow mode
  useEffect(() => {
    if (mode === "flow") {
      setPositions((prev) => {
        const next = new Map(prev);
        for (const t of topics) {
          const target = baseLayout.get(t.topic_id) ?? { x: 320, y: 150 };
          next.set(t.topic_id, {
            id: t.topic_id,
            x: target.x,
            y: target.y,
            vx: 0,
            vy: 0,
          });
        }
        return next;
      });
    }
  }, [topics, baseLayout, mode]);

  // Spring & Repulsion physics tick for organic mode or drag interaction
  useEffect(() => {
    if (mode !== "organic" && !draggingNode) return;

    let running = true;
    const tick = () => {
      setPositions((prev) => {
        const nodes = Array.from(prev.values());
        const W = 680;
        const H = 340;

        // Repulsion & Anti-collision packing among nodes (adapted from Obsidian sim.js Barnes-Hut & circle packing)
        const collisionMinDist = 72; // Prevents pill overlap
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            
            // Standard inverse-square repulsion
            const force = 2200 / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (a.id !== draggingNode) {
              a.vx -= fx;
              a.vy -= fy;
            }
            if (b.id !== draggingNode) {
              b.vx += fx;
              b.vy += fy;
            }

            // Anti-collision circle packing force from Obsidian sim.js
            if (dist < collisionMinDist) {
              const overlap = ((collisionMinDist - dist) / dist) * 0.48;
              const ox = dx * overlap;
              const oy = dy * overlap;
              if (a.id !== draggingNode) {
                a.vx -= ox;
                a.vy -= oy;
              }
              if (b.id !== draggingNode) {
                b.vx += ox;
                b.vy += oy;
              }
            }
          }
        }

        // Springs along prerequisite edges with degree weighting (from Obsidian sim.js link force q)
        for (const t of topics) {
          const b = prev.get(t.topic_id);
          if (!b) continue;
          const degB = Math.max(1, (t.prerequisites?.length ?? 0) + t.out_degree);
          for (const pId of t.prerequisites ?? []) {
            const a = prev.get(pId);
            if (!a) continue;
            const topicA = byId.get(pId);
            const degA = Math.max(1, (topicA?.prerequisites?.length ?? 0) + (topicA?.out_degree ?? 1));
            const weightA = degB / (degA + degB);
            const weightB = degA / (degA + degB);

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const rest = 145;
            const force = (dist - rest) * 0.045;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            if (a.id !== draggingNode) {
              a.vx += fx * weightA;
              a.vy += fy * weightA;
            }
            if (b.id !== draggingNode) {
              b.vx -= fx * weightB;
              b.vy -= fy * weightB;
            }
          }
        }

        // Center gravity with velocity damping (from Obsidian sim.js alpha & damping)
        const damping = 0.72;
        for (const n of nodes) {
          if (n.id === draggingNode) continue;
          n.vx += (W / 2 - n.x) * 0.018;
          n.vy += (H / 2 - n.y) * 0.018;

          n.vx *= damping;
          n.vy *= damping;

          n.x += Math.max(-14, Math.min(14, n.vx));
          n.y += Math.max(-14, Math.min(14, n.vy));
        }

        return new Map(nodes.map((n) => [n.id, { ...n }]));
      });

      if (running) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [mode, draggingNode, topics]);

  // Neighborhood identification
  const activeFocus = hovered || selectedTopicId;
  const neighborhood = useMemo(() => {
    if (!activeFocus) return null;
    const prereqs = new Set<string>();
    const dependents = new Set<string>();

    const targetTopic = byId.get(activeFocus);
    if (targetTopic) {
      for (const p of targetTopic.prerequisites ?? []) prereqs.add(p);
      for (const t of topics) {
        if ((t.prerequisites ?? []).includes(activeFocus)) dependents.add(t.topic_id);
      }
    }
    return { focus: activeFocus, prereqs, dependents };
  }, [activeFocus, byId, topics]);

  const radius = (t: Topic) => 13 + t.syllabus_weight * 28;

  // Zoom / Pan handlers
  const handleZoom = (delta: number) => {
    setTransform((t) => ({ ...t, k: Math.max(0.5, Math.min(2.2, t.k + delta)) }));
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, k: 1 });
  };

  // Dragging nodes
  const handleMouseDownNode = (e: React.MouseEvent, topicId: string) => {
    e.stopPropagation();
    setDraggingNode(topicId);
  };

  // Mouse-wheel zoom toward the cursor (native listener: React wheel is passive)
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const VBW = 680;
    const VBH = 340;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const svg = containerRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const sx = ((e.clientX - rect.left) / rect.width) * VBW;
      const sy = ((e.clientY - rect.top) / rect.height) * VBH;
      setTransform((t) => {
        const k2 = Math.max(0.5, Math.min(2.2, t.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        if (k2 === t.k) return t;
        return {
          k: k2,
          x: sx - ((sx - t.x) / t.k) * k2,
          y: sy - ((sy - t.y) / t.k) * k2,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (draggingNode) {
        const svg = containerRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        // Convert screen coordinates to SVG viewport space with transform
        const mouseX = (e.clientX - rect.left - transform.x) / transform.k;
        const mouseY = (e.clientY - rect.top - transform.y) / transform.k;

        setPositions((prev) => {
          const next = new Map(prev);
          const current = next.get(draggingNode);
          if (current) {
            next.set(draggingNode, {
              ...current,
              x: mouseX,
              y: mouseY,
              vx: 0,
              vy: 0,
            });
          }
          return next;
        });
      } else if (isPanning && panStart.current) {
        const dx = e.clientX - panStart.current.mouseX;
        const dy = e.clientY - panStart.current.mouseY;
        setTransform({
          ...transform,
          x: panStart.current.startX + dx,
          y: panStart.current.startY + dy,
        });
      }
    },
    [draggingNode, isPanning, transform],
  );

  const handleMouseUp = () => {
    setDraggingNode(null);
    setIsPanning(false);
    panStart.current = null;
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    panStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: transform.x,
      startY: transform.y,
    };
  };

  return (
    <div className="obsidian-graph-card">
      <div className="obsidian-graph-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <span className="small muted">Layout:</span>
          <button
            className={`btn small ${mode === "flow" ? "primary" : ""}`}
            onClick={() => setMode("flow")}
            style={{ padding: "3px 8px", fontSize: "0.78rem" }}
          >
            Prerequisites Flow
          </button>
          <button
            className={`btn small ${mode === "organic" ? "primary" : ""}`}
            onClick={() => setMode("organic")}
            style={{ padding: "3px 8px", fontSize: "0.78rem" }}
          >
            Organic Force
          </button>
        </div>

        <div className="row" style={{ gap: 6 }}>
          <span className="small muted">Filter:</span>
          <button
            className={`btn small ${filter === "all" ? "primary" : ""}`}
            onClick={() => setFilter("all")}
            style={{ padding: "3px 8px", fontSize: "0.78rem" }}
          >
            All ({topics.length})
          </button>
          <button
            className={`btn small ${filter === "hubs" ? "primary" : ""}`}
            onClick={() => setFilter("hubs")}
            style={{ padding: "3px 8px", fontSize: "0.78rem" }}
          >
            Hubs ({topics.filter((t) => t.out_degree > 0).length})
          </button>
          {mastery && (
            <button
              className={`btn small ${filter === "weak" ? "primary" : ""}`}
              onClick={() => setFilter("weak")}
              style={{ padding: "3px 8px", fontSize: "0.78rem" }}
            >
              Flagged Weak ({topics.filter((t) => mastery.get(t.topic_id)?.is_flagged_weak).length})
            </button>
          )}
        </div>

        <div className="row" style={{ gap: 4 }}>
          <button className="btn small" onClick={() => handleZoom(0.15)} title="Zoom In">
            +
          </button>
          <button className="btn small" onClick={() => handleZoom(-0.15)} title="Zoom Out">
            −
          </button>
          <button className="btn small" onClick={handleReset} title="Reset View">
            Reset
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="obsidian-graph-viewport"
        style={{
          width: "100%",
          height: 380,
          position: "relative",
          overflow: "hidden",
          background: "var(--paper)",
          cursor: isPanning ? "grabbing" : "grab",
        }}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          ref={containerRef}
          viewBox="0 0 680 340"
          style={{ width: "100%", height: "100%", display: "block" }}
          role="img"
          aria-label="Interactive Knowledge Mastery Graph"
        >
          <defs>
            <marker
              id="edge-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--line-strong)" strokeWidth="1.6" />
            </marker>
            <marker
              id="edge-arrow-highlight"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
            </marker>
          </defs>

          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {/* Edges */}
            {topics.flatMap((t) =>
              (t.prerequisites ?? []).map((pId) => {
                const a = positions.get(pId);
                const b = positions.get(t.topic_id);
                if (!a || !b) return null;

                const isVisible = visibleIds.has(t.topic_id) && visibleIds.has(pId);
                if (!isVisible) return null;

                const isConnected =
                  neighborhood === null ||
                  (neighborhood.focus === t.topic_id && neighborhood.prereqs.has(pId)) ||
                  (neighborhood.focus === pId && neighborhood.dependents.has(t.topic_id));

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const ra = radius(byId.get(pId) || t) + 2;
                const rb = radius(t) + 8;

                const strokeColor = isConnected && neighborhood !== null ? "var(--accent)" : "var(--line-strong)";
                const strokeWidth = isConnected && neighborhood !== null ? 2.4 : 1.2;
                const opacity = isConnected ? 0.9 : 0.12;

                return (
                  <line
                    key={`${pId}-${t.topic_id}`}
                    x1={a.x + (dx / len) * ra}
                    y1={a.y + (dy / len) * ra}
                    x2={b.x - (dx / len) * rb}
                    y2={b.y - (dy / len) * rb}
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    opacity={opacity}
                    markerEnd={isConnected && neighborhood !== null ? "url(#edge-arrow-highlight)" : "url(#edge-arrow)"}
                  />
                );
              }),
            )}

            {/* Nodes */}
            {visibleTopics.map((t) => {
              const p = positions.get(t.topic_id);
              if (!p) return null;

              const r = radius(t);
              const m = mastery?.get(t.topic_id);
              const isSelected = selectedTopicId === t.topic_id;
              const isHovered = hovered === t.topic_id;

              const isDimmed =
                neighborhood !== null &&
                neighborhood.focus !== t.topic_id &&
                !neighborhood.prereqs.has(t.topic_id) &&
                !neighborhood.dependents.has(t.topic_id);

              // Colors based on mastery or role
              let fillColor = "var(--surface)";
              let strokeColor = "var(--line-strong)";
              let isPulse = false;

              if (m !== undefined && m !== null) {
                if (m.is_flagged_weak) {
                  fillColor = "var(--danger-soft)";
                  strokeColor = "var(--danger)";
                  isPulse = true;
                } else if (m.mastery_score >= 0.8) {
                  fillColor = "var(--accent-soft)";
                  strokeColor = "var(--accent)";
                } else {
                  fillColor = "var(--warn-soft)";
                  strokeColor = "var(--warn)";
                }
              } else {
                if (t.out_degree > 0) {
                  fillColor = "var(--accent-soft)";
                  strokeColor = "var(--accent)";
                } else {
                  fillColor = "var(--surface-2)";
                  strokeColor = "var(--line-strong)";
                }
              }

              if (isSelected) {
                strokeColor = "var(--ink)";
              }

              return (
                <g
                  key={t.topic_id}
                  transform={`translate(${p.x}, ${p.y})`}
                  opacity={isDimmed ? 0.2 : 1}
                  onMouseEnter={() => setHovered(t.topic_id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTopic?.(t.topic_id);
                  }}
                  onMouseDown={(e) => handleMouseDownNode(e, t.topic_id)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Subtle pulsing beacon for weak/lure topics */}
                  {isPulse && (
                    <circle
                      r={r + 8}
                      fill="none"
                      stroke="var(--danger)"
                      strokeWidth="1.5"
                      opacity="0.4"
                      className="radar-ping"
                    />
                  )}

                  {/* Node Circle */}
                  <circle
                    r={isSelected || isHovered ? r + 3 : r}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={isSelected ? 3 : isHovered ? 2.5 : 1.8}
                  />

                  {/* Topic Code label */}
                  <text
                    y={4}
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="var(--mono)"
                    fontWeight="600"
                    fill="var(--ink)"
                  >
                    {t.code}
                  </text>

                  {/* Title label underneath */}
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight={isSelected ? "600" : "500"}
                    fill={isSelected ? "var(--ink)" : "var(--ink-soft)"}
                  >
                    {t.title.length > 22 ? `${t.title.slice(0, 21)}…` : t.title}
                  </text>

                  {/* Small mastery pill if available */}
                  {m !== undefined && m !== null && (
                    <text
                      y={-r - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fontFamily="var(--mono)"
                      fill={m.is_flagged_weak ? "var(--danger)" : "var(--muted)"}
                    >
                      {Math.round(m.mastery_score * 100)}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Float indicator on bottom left */}
        <div className="obsidian-graph-legend">
          <span className="dot" style={{ background: "var(--accent)" }} /> Mastered / Hub
          <span className="dot" style={{ background: "var(--warn)", marginLeft: 8 }} /> Fragile
          <span className="dot" style={{ background: "var(--danger)", marginLeft: 8 }} /> Flagged Weak
          <span className="small muted" style={{ marginLeft: 12 }}>
            Drag to rearrange &middot; Scroll to zoom &middot; Click to inspect backlinks
          </span>
        </div>
      </div>
    </div>
  );
}

function computeLayeredLayout(topics: Topic[], byId: Map<string, Topic>) {
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

  const rowH = 90;
  const rows = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const W = 680;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, col] of columns) {
    const x = maxDepth === 0 ? W / 2 : 110 + (d / maxDepth) * (W - 220);
    col.forEach((t, i) =>
      pos.set(t.topic_id, {
        x,
        y: 60 + i * rowH + ((rows - col.length) * rowH) / 2,
      }),
    );
  }
  return pos;
}
