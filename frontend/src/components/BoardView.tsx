import { readTable } from "./DatabaseTable";

// Kanban board for database pages: groups rows by their Status cell.
// Same properties shape as the table ({columns, rows}); moves report the
// row index + new status and the parent persists them.

const LANES = ["Not started", "Learning", "Mastered"];

function statusOf(row: string[], statusCol: number): string {
  const raw = statusCol >= 0 ? row[statusCol] : "";
  return LANES.includes(raw) ? raw : LANES[0];
}

export function BoardView({
  properties,
  onMove,
}: {
  properties: Record<string, unknown>;
  onMove: (rowIndex: number, status: string) => void;
}) {
  const { columns, rows } = readTable(properties);
  const topicCol = columns.indexOf("Topic");
  const trapCol = columns.indexOf("Trap");
  const statusCol = columns.indexOf("Status");
  const reviewsCol = columns.indexOf("Reviews");

  return (
    <div className="board" role="list" aria-label="Trap board by status">
      {LANES.map((lane) => {
        const cards = rows
          .map((row, i) => ({ row, i }))
          .filter(({ row }) => statusOf(row, statusCol) === lane);
        return (
          <section key={lane} className="panel board-lane" role="listitem" aria-label={`${lane}: ${cards.length} cards`}>
            <h2>
              {lane} <span className="muted">({cards.length})</span>
            </h2>
            {cards.length === 0 && <p className="lede">Empty.</p>}
            {cards.map(({ row, i }) => (
              <article key={i} className="board-card">
                <strong>{topicCol >= 0 ? row[topicCol] || "Untitled" : "Untitled"}</strong>
                {trapCol >= 0 && row[trapCol] && <p className="lede">{row[trapCol]}</p>}
                {reviewsCol >= 0 && row[reviewsCol] && (
                  <p className="muted">Reviews: {row[reviewsCol]}</p>
                )}
                <label className="sr-only" htmlFor={`move-${i}`}>Move card to status</label>
                <select
                  id={`move-${i}`}
                  value={statusOf(row, statusCol)}
                  onChange={(e) => onMove(i, e.target.value)}
                >
                  {LANES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
