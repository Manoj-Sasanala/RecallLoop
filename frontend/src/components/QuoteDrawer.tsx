import { useEffect, useRef, useState } from "react";
import { getPage } from "../api";
import type { PagePayload } from "../types";

function withHighlight(text: string, spans: { start: number; end: number }[]) {
  if (spans.length === 0) return text;
  const span = spans[0];
  return (
    <>
      {text.slice(0, span.start)}
      <mark>{text.slice(span.start, span.end)}</mark>
      {text.slice(span.end)}
    </>
  );
}

export function QuoteDrawer({
  docId,
  page,
  quote,
  onClose,
}: {
  docId: string;
  page: number;
  quote: string;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<PagePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    getPage(docId, page, quote)
      .then((data) => live && setPayload(data))
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [docId, page, quote]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <div className="eyebrow">Source page</div>
            <h2 id="drawer-title">Page {page}</h2>
          </div>
          <button ref={closeRef} className="btn small" onClick={onClose} aria-label="Close source page">
            Close
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {!payload && !error && <div className="waiting">Loading the page...</div>}
        {payload && (
          <div>
            <p className="drawer-text">{withHighlight(payload.raw_text, payload.highlight_char_spans)}</p>
            {payload.page_image_b64 && (
              <img src={`data:image/png;base64,${payload.page_image_b64}`} alt={`Scanned page ${page}`} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
