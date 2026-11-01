import { useState } from "react";

// Editable table for pages with page_type "database" (Notion-style table view).
// Rows live in page.properties {columns: string[], rows: string[][]}; the
// parent owns saving. The "Status" column renders a select, the rest are text.

export const TRAP_COLUMNS = ["Topic", "Trap", "Status", "Reviews", "Review on"];
const STATUSES = ["Not started", "Learning", "Mastered"];

export function readTable(properties: Record<string, unknown>): { columns: string[]; rows: string[][] } {
  const raw = properties as { columns?: unknown; rows?: unknown };
  const columns = Array.isArray(raw.columns) && raw.columns.length > 0
    ? (raw.columns as unknown[]).map(String)
    : [...TRAP_COLUMNS];
  const rows = Array.isArray(raw.rows)
    ? (raw.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map(String))
    : [];
  return { columns, rows };
}

function Cell({
  value,
  status,
  onChange,
  label,
}: {
  value: string;
  status: boolean;
  onChange: (v: string) => void;
  label: string;
}) {
  if (status) {
    return (
      <select aria-label={label} value={STATUSES.includes(value) ? value : STATUSES[0]} onChange={(e) => onChange(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    );
  }
  return <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder="—" />;
}

export function DatabaseTable({
  properties,
  onChange,
}: {
  properties: Record<string, unknown>;
  onChange: (properties: Record<string, unknown>) => void;
}) {
  const { columns, rows } = readTable(properties);
  const [confirming, setConfirming] = useState<number | null>(null);

  const setCell = (r: number, c: number, value: string) => {
    const next = rows.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row));
    onChange({ ...properties, columns, rows: next });
  };

  const addRow = () => {
    onChange({ ...properties, columns, rows: [...rows, columns.map((c) => (c === "Status" ? STATUSES[0] : ""))] });
  };

  const removeRow = (r: number) => {
    onChange({ ...properties, columns, rows: rows.filter((_, i) => i !== r) });
    setConfirming(null);
  };

  return (
    <div>
      {rows.length === 0 && (
        <p className="lede" role="status">No rows yet. Add one, or fill from the diagnosis below.</p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table database-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col">{c}</th>
              ))}
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {columns.map((c, col) => (
                  <td key={col}>
                    <Cell
                      value={row[col] ?? ""}
                      status={c === "Status"}
                      label={`${c} row ${r + 1}`}
                      onChange={(v) => setCell(r, col, v)}
                    />
                  </td>
                ))}
                <td>
                  {confirming === r ? (
                    <span className="row">
                      <button className="btn small" onClick={() => removeRow(r)}>Yes</button>
                      <button className="btn ghost small" onClick={() => setConfirming(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="btn ghost small" aria-label={`Delete row ${r + 1}`} onClick={() => setConfirming(r)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row mt-16">
        <button className="btn small" onClick={addRow}>Add row</button>
      </div>
    </div>
  );
}
