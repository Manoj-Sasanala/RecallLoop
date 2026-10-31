import { useMemo, useState } from "react";
import type { RevisionItem, SessionSummary } from "../types";

type DayCell = { date: Date; inMonth: boolean; items: { session: SessionSummary; item: RevisionItem }[] };

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

// Month grid of revision due dates across sessions.
export function RevisionCalendar({
  sessions,
  plans,
}: {
  sessions: SessionSummary[];
  plans: Record<string, RevisionItem[]>;
}) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const cells = useMemo<DayCell[]>(() => {
    const first = startOfMonth(cursor);
    const start = new Date(first);
    start.setDate(start.getDate() - ((first.getDay() + 6) % 7)); // Monday-first
    const out: DayCell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const iso = date.toISOString().slice(0, 10);
      const items: DayCell["items"] = [];
      for (const s of sessions) {
        for (const item of plans[s.session_id] ?? []) {
          if (item.review_on.slice(0, 10) === iso) items.push({ session: s, item });
        }
      }
      out.push({ date, inMonth: date.getMonth() === cursor.getMonth(), items });
    }
    return out;
  }, [cursor, sessions, plans]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <section className="panel" aria-labelledby="planner-heading">
      <div className="panel-head">
        <h2 id="planner-heading">{monthLabel}</h2>
        <span className="row" style={{ gap: 6 }}>
          <button
            className="btn small"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <button className="btn small" onClick={() => setCursor(startOfMonth(new Date()))}>
            Today
          </button>
          <button
            className="btn small"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: 4,
        }}
      >
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="small muted" style={{ textAlign: "center", padding: "2px 0" }}>
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          const iso = cell.date.toISOString().slice(0, 10);
          const isToday = iso === todayIso;
          return (
            <div
              key={i}
              style={{
                minHeight: 56,
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: "3px 5px",
                background: isToday ? "var(--accent-soft)" : cell.inMonth ? "var(--surface)" : "var(--paper)",
                opacity: cell.inMonth ? 1 : 0.55,
                overflow: "hidden",
              }}
              title={cell.items.map(({ item }) => item.title).join(", ") || undefined}
            >
              <div
                className="mono small"
                style={{ fontWeight: isToday ? 700 : 400, color: isToday ? "var(--accent)" : undefined }}
              >
                {cell.date.getDate()}
              </div>
              {cell.items.slice(0, 2).map(({ session, item }) => (
                <div
                  key={session.session_id + item.topic_id}
                  className="small"
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: item.is_flagged_weak ? "var(--danger)" : "var(--ink-soft)",
                  }}
                >
                  {item.is_flagged_weak ? "● " : "○ "}
                  {item.title}
                </div>
              ))}
              {cell.items.length > 2 && <div className="small muted">+{cell.items.length - 2} more</div>}
            </div>
          );
        })}
      </div>
      <p className="small muted mt-16">
        ● weak topic due &middot; ○ reinforcement due &middot; computed from your latest graded round per session.
      </p>
    </section>
  );
}
