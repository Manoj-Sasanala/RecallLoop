import { useMemo, useState } from "react";
import type { GradeResult, Topic } from "../types";

export type CanvasNodeType = "topic" | "lure" | "note" | "group";

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  title: string;
  body?: string;
  color?: string; // Obsidian color index "1" (red) .. "6" (purple)
  topicId?: string;
  accuracy?: number;
  vulnerability?: number;
  isWeak?: boolean;
  page?: number;
  quote?: string;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide: "top" | "right" | "bottom" | "left";
  toNode: string;
  toSide: "top" | "right" | "bottom" | "left";
  label?: string;
  color?: string;
}

export function StudyCanvas({
  grade,
  topics,
  sessionTitle = "RecallLoop Session",
  onOpenQuote,
}: {
  grade: GradeResult;
  topics: Topic[];
  sessionTitle?: string;
  onOpenQuote?: (page: number, quote: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Initialize initial nodes and edges from grade breakdown and lures
  const initialData = useMemo(() => {
    const nodes: CanvasNode[] = [];
    const edges: CanvasEdge[] = [];
    const topicNodesMap = new Map<string, string>();

    // Topic nodes
    grade.topic_breakdown.forEach((t, i) => {
      const nodeId = `topic-${t.topic_id}`;
      topicNodesMap.set(t.topic_id, nodeId);

      const col = i % 3;
      const row = Math.floor(i / 3);

      nodes.push({
        id: nodeId,
        type: "topic",
        title: t.title,
        body: `Vulnerability score: ${t.vulnerability_score.toFixed(2)}`,
        x: 420 + col * 280,
        y: 80 + row * 220,
        width: 250,
        height: 160,
        color: t.is_flagged_weak ? "1" : "4", // 1 = red, 4 = green
        topicId: t.topic_id,
        accuracy: t.raw_accuracy,
        vulnerability: t.vulnerability_score,
        isWeak: t.is_flagged_weak,
      });
    });

    // Lure misconception cards on the left column
    let lureRow = 0;
    const topicOf = (page: number) =>
      topics.find((t) => t.page_refs.some((r) => page >= r.start_page && page <= r.end_page));
    grade.graded_items.forEach((item) => {
      if (!item.is_correct && item.endorsed_misconception) {
        const lureId = `lure-${item.question_id}`;
        nodes.push({
          id: lureId,
          type: "lure",
          title: `Lure: ${item.endorsed_misconception}`,
          body: `You selected: "${item.selected_option_text}"`,
          x: 60,
          y: 80 + lureRow * 200,
          width: 300,
          height: 170,
          color: "1", // Red callout
          page: item.source_page_number,
          quote: item.verbatim_source_quote,
        });

        // Edge from lure to corresponding topic
        const targetTopicNodeId = topicNodesMap.get(topicOf(item.source_page_number)?.topic_id ?? "");
        if (targetTopicNodeId) {
          edges.push({
            id: `edge-${lureId}-${targetTopicNodeId}`,
            fromNode: lureId,
            fromSide: "right",
            toNode: targetTopicNodeId,
            toSide: "left",
            label: "entrapment",
            color: "1",
          });
        }
        lureRow++;
      }
    });

    // Prerequisite edges between topics
    for (const t of topics) {
      const toId = topicNodesMap.get(t.topic_id);
      if (!toId) continue;
      for (const pId of t.prerequisites ?? []) {
        const fromId = topicNodesMap.get(pId);
        if (fromId) {
          edges.push({
            id: `edge-prereq-${fromId}-${toId}`,
            fromNode: fromId,
            fromSide: "bottom",
            toNode: toId,
            toSide: "top",
            label: "prerequisite",
          });
        }
      }
    }

    return { nodes, edges };
  }, [grade, topics]);

  const [nodes, setNodes] = useState<CanvasNode[]>(() => initialData.nodes);
  const [edges] = useState<CanvasEdge[]>(() => initialData.edges);

  // Background panning
  const handleMouseDownBg = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("canvas-bg")) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    setSelectedNodeId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    } else if (draggingNodeId) {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== draggingNodeId) return n;
          return {
            ...n,
            x: Math.round((e.clientX - pan.x) / zoom - dragOffset.x),
            y: Math.round((e.clientY - pan.y) / zoom - dragOffset.y),
          };
        }),
      );
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  // Node drag start
  const handleNodeMouseDown = (e: React.MouseEvent, node: CanvasNode) => {
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    const mouseCanvasX = (e.clientX - pan.x) / zoom;
    const mouseCanvasY = (e.clientY - pan.y) / zoom;
    setDragOffset({
      x: mouseCanvasX - node.x,
      y: mouseCanvasY - node.y,
    });
  };

  // Add custom note card
  const handleAddNote = () => {
    const newId = `note-${Date.now()}`;
    const newNode: CanvasNode = {
      id: newId,
      type: "note",
      title: "New Study Note",
      body: "Type key takeaways or mnemonics here...",
      x: Math.round((-pan.x + 300) / zoom),
      y: Math.round((-pan.y + 200) / zoom),
      width: 240,
      height: 140,
      color: "3", // Yellow
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newId);
  };

  // Auto arrange into clean layout
  const handleAutoArrange = () => {
    setNodes((prev) => {
      let lureCount = 0;
      let topicCount = 0;
      let noteCount = 0;
      return prev.map((n) => {
        if (n.type === "lure") {
          const res = { ...n, x: 60, y: 80 + lureCount * 200 };
          lureCount++;
          return res;
        }
        if (n.type === "topic") {
          const col = topicCount % 3;
          const row = Math.floor(topicCount / 3);
          const res = { ...n, x: 420 + col * 290, y: 80 + row * 220 };
          topicCount++;
          return res;
        }
        const res = { ...n, x: 420 + noteCount * 260, y: 600 };
        noteCount++;
        return res;
      });
    });
  };

  // Export as genuine Obsidian .canvas JSON file
  const handleExportCanvas = () => {
    const obsidianCanvas = {
      nodes: nodes.map((n) => {
        let textContent = `## ${n.title}\n\n${n.body || ""}`;
        if (n.quote && n.page) {
          textContent += `\n\n> [!quote] Source Truth (p.${n.page})\n> "${n.quote}"`;
        }
        return {
          id: n.id,
          type: "text",
          text: textContent,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          color: n.color || "1",
        };
      }),
      edges: edges.map((e) => ({
        id: e.id,
        fromNode: e.fromNode,
        fromSide: e.fromSide,
        toNode: e.toNode,
        toSide: e.toSide,
        label: e.label,
        color: e.color,
      })),
    };

    const blob = new Blob([JSON.stringify(obsidianCanvas, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.canvas`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Node position lookup
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // Compute bezier edge path
  const getEdgePath = (edge: CanvasEdge) => {
    const from = nodeMap.get(edge.fromNode);
    const to = nodeMap.get(edge.toNode);
    if (!from || !to) return null;

    let x1 = from.x + from.width;
    let y1 = from.y + from.height / 2;
    if (edge.fromSide === "bottom") {
      x1 = from.x + from.width / 2;
      y1 = from.y + from.height;
    }

    let x2 = to.x;
    let y2 = to.y + to.height / 2;
    if (edge.toSide === "top") {
      x2 = to.x + to.width / 2;
      y2 = to.y;
    }

    const dx = Math.abs(x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div
      className="relative w-full h-[640px] bg-stone-900 border border-stone-800 rounded-xl overflow-hidden select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={(e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.08 : -0.08;
        setZoom((z) => Math.max(0.4, Math.min(2.0, z + delta)));
      }}
    >
      {/* Top Toolbar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-stone-800/90 backdrop-blur px-3 py-2 rounded-lg border border-stone-700 shadow-lg text-xs text-stone-200">
        <span className="font-semibold text-emerald-400">Obsidian Canvas Mode</span>
        <span className="text-stone-500">|</span>
        <button
          type="button"
          onClick={handleAddNote}
          className="px-2.5 py-1 bg-stone-700 hover:bg-stone-600 rounded transition font-medium text-stone-100"
        >
          + Add Card
        </button>
        <button
          type="button"
          onClick={handleAutoArrange}
          className="px-2.5 py-1 bg-stone-700 hover:bg-stone-600 rounded transition font-medium text-stone-100"
        >
          Auto Arrange
        </button>
        <span className="text-stone-500">|</span>
        <button
          type="button"
          onClick={handleExportCanvas}
          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 rounded transition font-semibold text-white shadow-sm"
          title="Download genuine .canvas JSON file to open directly in Obsidian"
        >
          Export .canvas
        </button>
      </div>

      {/* Zoom Controls */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1 bg-stone-800/90 backdrop-blur px-2 py-1.5 rounded-lg border border-stone-700 shadow text-xs text-stone-200">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
          className="w-6 h-6 hover:bg-stone-700 rounded font-bold"
        >
          -
        </button>
        <span className="w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
          className="w-6 h-6 hover:bg-stone-700 rounded font-bold"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 60, y: 40 });
          }}
          className="ml-1 px-1.5 py-0.5 hover:bg-stone-700 rounded text-stone-400 hover:text-stone-200"
        >
          Reset
        </button>
      </div>

      {/* SVG & HTML Infinite Canvas Surface */}
      <div
        className="canvas-bg absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDownBg}
        style={{
          backgroundImage: "radial-gradient(#383533 1px, transparent 1px)",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "absolute",
            width: "100%",
            height: "100%",
          }}
        >
          {/* SVG Edges Layer */}
          <svg
            className="absolute top-0 left-0 overflow-visible pointer-events-none"
            style={{ width: "3000px", height: "3000px" }}
          >
            <defs>
              <marker
                id="canvas-arrow"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#ef4444" />
              </marker>
              <marker
                id="canvas-arrow-dim"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#78716c" />
              </marker>
            </defs>

            {edges.map((e) => {
              const d = getEdgePath(e);
              if (!d) return null;
              const isLure = e.color === "1";
              return (
                <g key={e.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={isLure ? "#ef4444" : "#78716c"}
                    strokeWidth={isLure ? "2.5" : "1.8"}
                    strokeDasharray={isLure ? "4 3" : undefined}
                    markerEnd={isLure ? "url(#canvas-arrow)" : "url(#canvas-arrow-dim)"}
                    opacity={isLure ? 0.9 : 0.6}
                  />
                  {e.label && (
                    <text
                      fill={isLure ? "#fca5a5" : "#a8a29e"}
                      fontSize="10"
                      className="font-mono"
                    >
                      <textPath href={`#${e.id}`} startOffset="50%" textAnchor="middle">
                        {e.label}
                      </textPath>
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* HTML Nodes Layer */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isLure = node.type === "lure";
            const isWeak = node.isWeak;

            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                style={{
                  position: "absolute",
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  minHeight: `${node.height}px`,
                }}
                className={`p-3.5 rounded-xl border text-stone-100 shadow-xl transition-shadow cursor-move ${
                  isSelected ? "ring-2 ring-emerald-400 shadow-emerald-900/40" : ""
                } ${
                  isLure
                    ? "bg-rose-950/80 border-rose-800/80"
                    : isWeak
                    ? "bg-amber-950/70 border-amber-800/70"
                    : node.type === "note"
                    ? "bg-stone-800/90 border-yellow-700/60"
                    : "bg-stone-800/90 border-stone-700/80"
                }`}
              >
                {/* Node Header */}
                <div className="flex items-center justify-between gap-2 mb-2 pb-1 border-b border-white/10">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isLure ? "bg-rose-500" : isWeak ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider truncate">
                      {isLure ? "Lure Trap" : node.type === "topic" ? "Topic Card" : "Study Note"}
                    </span>
                  </div>
                  {node.accuracy !== undefined && (
                    <span
                      className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                        node.accuracy >= 0.7
                          ? "bg-emerald-900/60 text-emerald-300"
                          : "bg-rose-900/60 text-rose-300"
                      }`}
                    >
                      {Math.round(node.accuracy * 100)}%
                    </span>
                  )}
                </div>

                {/* Node Title */}
                <h4 className="text-sm font-bold text-white mb-1.5 line-clamp-2 leading-snug">
                  {node.title}
                </h4>

                {/* Node Body */}
                <p className="text-xs text-stone-300 leading-relaxed mb-2.5 whitespace-pre-wrap">
                  {node.body}
                </p>

                {/* Source Verification Quote Button if present */}
                {node.quote && node.page && onOpenQuote && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenQuote(node.page!, node.quote!);
                    }}
                    className="w-full mt-1 px-2.5 py-1 text-left text-xs bg-rose-900/40 hover:bg-rose-900/70 border border-rose-700/60 rounded text-rose-200 transition flex items-center justify-between"
                  >
                    <span>Inspect p.{node.page} quote</span>
                    <span className="font-mono text-rose-400">→</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
