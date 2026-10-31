import { useMemo } from "react";
import type { SessionSummary } from "../types";

// Sessions per day (bars) + average mastery per day (line), last 14 days.
export function DailyProgress({ sessions }: { sessions: SessionSummary[] }) {
  const days = useMemo(() => {
    const out: { iso: string; label: string; count: number; mastery: number | null }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const sameDay = sessions.filter((s) => (s.created_at ?? "").slice(0, 10) === iso);
      const mastered = sameDay.map((s) => s.last_mastery).filter((m): m is number => m !== null);
      out.push({
        iso,
        label: d.toLocaleDateString(undefined, { day: "numeric", month: "numeric" }),
        count: sameDay.length,
        mastery: mastered.length > 0 ? mastered.reduce((a, b) => a + b, 0) / mastered.length : null,
      });
    }
    return out;
  }, [sessions]);

  const W = 640;
  const H = 180;
  const pad = 28;
  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const bw = (W - pad * 2) / days.length;

  return (
    <section className="panel" aria-labelledby="progress-heading">
      <div className="panel-head">
        <h2 id="progress-heading">Daily progress</h2>
        <span className="hint">sessions per day &middot; dot = avg mastery</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Daily progress chart">
        <line x1={pad} y1={H - pad} x2={W - 8} y2={H - pad} stroke="var(--line-strong)" />
        {days.map((d, i) => {
          const x = pad + i * bw + 2;
          const h = ((H - pad - 20) * d.count) / maxCount;
          return (
            <g key={d.iso}>
              <title>{`${d.label}: ${d.count} session${d.count === 1 ? "" : "s"}${d.mastery !== null ? `, mastery ${Math.round(d.mastery * 100)}%` : ""}`}</title>
              <rect
                x={x}
                y={H - pad - h}
                width={Math.max(2, bw - 5)}
                height={h}
                fill={d.count > 0 ? "var(--accent)" : "var(--surface-2)"}
                opacity={d.count > 0 ? 0.75 : 1}
                rx={2}
              />
              {d.mastery !== null && (
                <circle
                  cx={x + Math.max(2, bw - 5) / 2}
                  cy={H - pad - h - 8}
                  r={4}
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth={2}
                />
              )}
              {i % 2 === 0 && (
                <text x={x} y={H - 10} fontSize="9" fill="var(--muted)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="small muted">Bars count sessions &middot; rings mark days with graded rounds, positioned by count.</p>
    </section>
  );
}
