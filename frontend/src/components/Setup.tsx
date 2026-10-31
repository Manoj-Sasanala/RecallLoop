import { useRef, useState } from "react";

export function Setup({
  onDemo,
  onUpload,
  busy,
}: {
  onDemo: (bundleId: string) => void;
  onUpload: (title: string, files: File[]) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Step 1 - Sources</div>
          <h1>Find out what you actually know.</h1>
          <p className="lede">
            Upload your course material, sit a source-grounded exam, and get a measured diagnosis of the misconceptions
            you carry. Then prove the fix on a new exam.
          </p>
        </div>
        <span className="session-chip">
          <span className="dot" aria-hidden="true" /> Deterministic grading, no chat
        </span>
      </header>

      <section aria-labelledby="demo-heading">
        <div className="panel-head">
          <h2 id="demo-heading">Seeded demo courses</h2>
          <span className="hint">Instant - no model calls, no waiting</span>
        </div>
        <div className="demo-grid">
          <button className="demo-card" onClick={() => onDemo("cs_raft")} disabled={busy}>
            <span className="code">CS-451 / DISTRIBUTED SYSTEMS</span>
            <span className="title">Raft consensus</span>
            <span className="desc">
              Leader election, log replication, and the safety guarantee. Six diagnostic items, four targeted retest
              items.
            </span>
            <span className="meta">4 source pages &middot; 2 topics &middot; 6 + 4 questions</span>
          </button>

          <button className="demo-card" onClick={() => onDemo("med_cardio")} disabled={busy}>
            <span className="code">MED-512 / CLINICAL CARDIOLOGY</span>
            <span className="title">Heart failure</span>
            <span className="desc">
              HFrEF thresholds and the four pillars of guideline-directed therapy. Six diagnostic items, four targeted
              retest items.
            </span>
            <span className="meta">4 source pages &middot; 2 topics &middot; 6 + 4 questions</span>
          </button>
        </div>
      </section>

      <section className="panel mt-24" aria-labelledby="upload-heading">
        <div className="panel-head">
          <h2 id="upload-heading">Or bring your own material</h2>
          <span className="hint">PDF &middot; text extracted page by page</span>
        </div>

        <form
          className="drop"
          onSubmit={(event) => {
            event.preventDefault();
            if (files.length) onUpload(title.trim() || files[0].name.replace(/\.pdf$/i, ""), files);
          }}
        >
          <label htmlFor="session-title">Course title</label>
          <input
            id="session-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Biology 201 - Cell signalling"
            style={{
              font: "inherit",
              padding: "9px 12px",
              border: "1px solid var(--line-strong)",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
            }}
          />

          <label htmlFor="pdf-input">Study material</label>
          <input
            id="pdf-input"
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          <span className="hint">
            Text-based PDFs. Slides, lecture notes, or a textbook chapter. Diagrams are read when the provider supports
            vision.
          </span>

          {files.length > 0 && (
            <ul className="file-list">
              {files.map((file) => (
                <li key={file.name}>
                  <span>{file.name}</span>
                  <span className="mono">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </li>
              ))}
            </ul>
          )}

          <div className="row">
            <button className="btn primary" type="submit" disabled={busy || files.length === 0}>
              Upload and build blueprint
            </button>
            <span className="small muted">Two model calls: topic blueprint, then question generation.</span>
          </div>
        </form>
      </section>
    </>
  );
}
