import { useEffect, useRef, useState } from "react";
import { createNotePage, deleteNotePage, getRevision, listNotePages, updateNotePage } from "../api";
import type { NotePage } from "../types";
import { BoardView } from "./BoardView";
import { DatabaseTable, TRAP_COLUMNS, readTable } from "./DatabaseTable";
import { findBacklinks, parseWikilinks, resolveWikilink } from "./PageLinks";
import { PAGE_TEMPLATES, templateContent } from "./PageTemplates";

// Notion-style pages: sidebar list with subpages, markdown editor with
// autosave, editable table view for database pages, and deterministic
// templates. "Fill from diagnosis" seeds the trap tracker from graded data.

export function PagesView({ sessionId, title, onBack }: { sessionId: string; title: string; onBack: () => void }) {
  const [pages, setPages] = useState<NotePage[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftProps, setDraftProps] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    listNotePages(sessionId)
      .then((body) => {
        if (!live) return;
        setPages(body.pages);
        setSelectedId(body.pages[0]?.id ?? null);
      })
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [sessionId]);

  const selected = pages?.find((p) => p.id === selectedId) ?? null;

  // Load the selected page into the editable draft.
  useEffect(() => {
    setDraft(selected?.content_md ?? "");
    setDraftTitle(selected?.title ?? "");
    setDraftProps(selected?.properties ?? {});
    setSaved(true);
    setConfirmDelete(false);
    setShowTemplates(false);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Table edits save through the same debounced persist; the fresh
  // Table edits save through the same debounced persist; the fresh
  // properties object is passed straight through (no stale state).
  // Discrete actions (view switch, add/remove row, fill) save immediately.
  const saveProps = (props: Record<string, unknown>, immediate = false) => {
    setDraftProps(props);
    persist({ properties: props }, immediate);
  };

  const persist = (
    patch: { title?: string; content_md?: string; properties?: Record<string, unknown> },
    immediate = false,
  ) => {
    if (!selected) return;
    setSaved(false);
    if (timer.current) window.clearTimeout(timer.current);
    const snapshot = {
      title: patch.title ?? draftTitle,
      content_md: patch.content_md ?? draft,
      properties: patch.properties ?? draftProps,
    };
    const save = () => {
      updateNotePage(sessionId, selected.id, snapshot)
        .then((saved) => {
          setPages((cur) => cur?.map((p) => (p.id === saved.id ? saved : p)) ?? cur);
          setSaved(true);
        })
        .catch((err: Error) => setError(err.message));
    };
    // Discrete actions (view switch, status move, pin) save at once;
    // typing stays debounced so fast keystrokes collapse into one request.
    if (immediate) {
      save();
    } else {
      timer.current = window.setTimeout(save, 800);
    }
  };

  const createFromTemplate = (templateId: string, parentId: string | null) => {
    setError(null);
    getRevision(sessionId)
      .then((rev) => templateContent(templateId, rev.items))
      .catch(() => templateContent(templateId, []))
      .then((tpl) => createNotePage(sessionId, { title: tpl.title, icon: tpl.icon, content_md: tpl.content_md, parent_page_id: parentId }))
      .then((page) => {
        setPages((cur) => [...(cur ?? []), page]);
        setSelectedId(page.id);
        setShowTemplates(false);
      })
      .catch((err: Error) => setError(err.message));
  };

  const removeSelected = () => {
    if (!selected) return;
    deleteNotePage(sessionId, selected.id)
      .then(() => {
        setPages((cur) => {
          const next = (cur ?? []).filter((p) => p.id !== selected.id);
          setSelectedId(next[0]?.id ?? null);
          return next;
        });
      })
      .catch((err: Error) => setError(err.message));
  };

  const fillFromDiagnosis = () => {
    if (!selected) return;
    getRevision(sessionId)
      .then((rev) => {
        const weak = rev.items.filter((i) => i.is_flagged_weak);
        const source = weak.length > 0 ? weak : rev.items;
        if (source.length === 0) {
          setError("No graded rounds yet — sit an exam first, then fill from the diagnosis.");
          return;
        }
        const rows = source.map((i) => [i.title, i.reason, "Not started", "0", i.review_on ?? ""]);
        const props = { ...readTable(draftProps), columns: [...TRAP_COLUMNS], rows };
        setDraftProps(props);
        persist({ properties: props });
      })
      .catch((err: Error) => setError(err.message));
  };

  const tops = (pages ?? []).filter((p) => !p.parent_page_id);
  const pinnedFirst = (list: NotePage[]) =>
    [...list].sort((a, b) => Number(Boolean(b.properties.pinned)) - Number(Boolean(a.properties.pinned)));
  // Tolerant match: every query word must start-match a title word,
  // so "trap tracker" finds "Traps Tracker" and plurals don't matter.
  const matches = (p: NotePage) => {
    const words = p.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((q) => words.some((w) => w.startsWith(q)));
  };
  const visibleTops = query.trim() ? [] : pinnedFirst(tops.filter(() => true));
  const searchHits = query.trim() ? (pages ?? []).filter(matches) : [];

  const togglePin = (page: NotePage) => {
    updateNotePage(sessionId, page.id, { properties: { ...page.properties, pinned: !page.properties.pinned } })
      .then((saved) => setPages((cur) => cur?.map((p) => (p.id === saved.id ? saved : p)) ?? cur))
      .catch((err: Error) => setError(err.message));
  };

  const duplicatePage = () => {
    if (!selected) return;
    createNotePage(sessionId, {
      title: `${selected.title} (copy)`,
      icon: selected.icon,
      page_type: selected.page_type,
      parent_page_id: selected.parent_page_id,
      content_md: selected.content_md,
      properties: selected.properties as Record<string, unknown>,
    })
      .then((page) => {
        setPages((cur) => [...(cur ?? []), page]);
        setSelectedId(page.id);
      })
      .catch((err: Error) => setError(err.message));
  };

  const exportMarkdown = (download: boolean) => {
    if (!selected) return;
    const text = `# ${selected.title}\n\n${draft}`;
    if (download) {
      const blob = new Blob([text], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.title.replace(/[^\w\- ]+/g, "").trim() || "page"}.md`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Copy failed — select the text manually."));
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Pages</div>
          <h1>{title}</h1>
          <p className="lede">Study notes as pages, with a trap tracker table. Autosaves as you type.</p>
        </div>
        <span className="session-chip">
          <span className="dot" aria-hidden="true" /> {saved ? "Saved" : "Saving…"}
        </span>
      </header>

      {error && (
        <div className="error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {pages === null ? (
        <div className="waiting">Loading pages…</div>
      ) : (
        <div className="pages-layout">
          <nav className="panel pages-side" aria-label="Pages">
            <label className="sr-only" htmlFor="page-search">Search pages</label>
            <input
              id="page-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages…"
              style={{ font: "inherit", fontSize: "0.85rem", padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)", width: "100%" }}
            />
            {query.trim() ? (
              searchHits.length === 0 ? (
                <p className="lede" role="status">No pages match.</p>
              ) : (
                searchHits.map((p) => (
                  <div key={p.id} className="page-row">
                    <button className={`page-item${p.id === selectedId ? " active" : ""}`} onClick={() => setSelectedId(p.id)}>
                      <span aria-hidden="true">{p.icon}</span>
                      <span className="t">{p.title}</span>
                    </button>
                  </div>
                ))
              )
            ) : (
            visibleTops.map((p) => (
              <div key={p.id}>
                <div className="page-row">
                  <button className={`page-item${p.id === selectedId ? " active" : ""}`} onClick={() => setSelectedId(p.id)}>
                    <span aria-hidden="true">{p.icon}</span>
                    <span className="t">{p.title}</span>
                  </button>
                  <button
                    className="btn ghost small"
                    aria-label={p.properties.pinned ? `Unpin ${p.title}` : `Pin ${p.title}`}
                    title={p.properties.pinned ? "Unpin" : "Pin to top"}
                    onClick={() => togglePin(p)}
                  >
                    {p.properties.pinned ? "★" : "☆"}
                  </button>
                </div>
                {(pages ?? [])
                  .filter((s) => s.parent_page_id === p.id)
                  .map((s) => (
                    <div key={s.id} className="page-row">
                      <button
                        className={`page-item sub${s.id === selectedId ? " active" : ""}`}
                        onClick={() => setSelectedId(s.id)}
                      >
                        <span aria-hidden="true">{s.icon}</span>
                        <span className="t">{s.title}</span>
                      </button>
                    </div>
                  ))}
              </div>
            ))
            )}
            <div className="row mt-16">
              <button className="btn small" onClick={() => setShowTemplates((v) => !v)}>
                {showTemplates ? "Close" : "New page"}
              </button>
            </div>
            {showTemplates && (
              <div style={{ display: "grid", gap: 8 }}>
                {PAGE_TEMPLATES.map((t) => (
                  <button key={t.id} className="btn small" title={t.blurb} onClick={() => createFromTemplate(t.id, null)}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}
          </nav>

          <section className="panel" aria-label="Page editor">
            {!selected ? (
              <p className="lede" role="status">No pages yet — create one from the sidebar.</p>
            ) : (
              <>
                <label className="sr-only" htmlFor="page-title">Page title</label>
                <input
                  id="page-title"
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    persist({ title: e.target.value });
                  }}
                  style={{ font: "inherit", fontSize: "1.25rem", fontWeight: 650, border: "none", background: "transparent", width: "100%", marginBottom: 8 }}
                />
                {selected.page_type !== "database" && parseWikilinks(draft).length > 0 && (
                  <div className="row" style={{ marginBottom: 12 }} aria-label="Outgoing page links">
                    <span className="muted">Links:</span>
                    {parseWikilinks(draft).map((t) => {
                      const target = pages ? resolveWikilink(pages, t, selected.id) : null;
                      return target ? (
                        <button key={t} className="btn small" onClick={() => setSelectedId(target.id)}>
                          {target.icon} {target.title}
                        </button>
                      ) : (
                        <span key={t} className="muted">[[{t}]]</span>
                      );
                    })}
                  </div>
                )}
                {selected.page_type === "database" ? (
                  <>
                    <div className="row" style={{ marginBottom: 12 }}>
                      <div className="view-switch" role="tablist" aria-label="Database view">
                        {(["table", "board"] as const).map((v) => (
                          <button
                            key={v}
                            role="tab"
                            aria-selected={(draftProps.view ?? "table") === v}
                            className={(draftProps.view ?? "table") === v ? "active" : ""}
                            onClick={() => saveProps({ ...draftProps, view: v }, true)}
                          >
                            {v === "table" ? "Table" : "Board"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {draftProps.view === "board" ? (
                      <BoardView
                        properties={draftProps}
                        onMove={(rowIndex, status) => {
                          const { columns, rows } = readTable(draftProps);
                          const statusCol = columns.indexOf("Status");
                          if (statusCol < 0) return;
                          const next = rows.map((row, i) =>
                            i === rowIndex ? row.map((cell, j) => (j === statusCol ? status : cell)) : row,
                          );
                          saveProps({ ...draftProps, columns, rows: next }, true);
                        }}
                      />
                    ) : (
                      <DatabaseTable properties={draftProps} onChange={saveProps} />
                    )}
                    <div className="row mt-16">
                      <button className="btn small" onClick={fillFromDiagnosis}>Fill from diagnosis</button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="sr-only" htmlFor="page-content">Page content in Markdown</label>
                    <textarea
                      id="page-content"
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        persist({ content_md: e.target.value });
                      }}
                      rows={16}
                      placeholder={"# What I must remember\n\n- ..."}
                      style={{
                        width: "100%",
                        font: "inherit",
                        fontFamily: "var(--mono)",
                        fontSize: "0.88rem",
                        lineHeight: 1.7,
                        padding: 12,
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius)",
                        background: "var(--paper)",
                        resize: "vertical",
                      }}
                    />
                  </>
                )}
                {pages && findBacklinks(pages, selected).length > 0 && (
                  <div className="row mt-16" aria-label="Pages linking here">
                    <span className="muted">Linked from:</span>
                    {findBacklinks(pages, selected).map((p) => (
                      <button key={p.id} className="btn small" onClick={() => setSelectedId(p.id)}>
                        {p.icon} {p.title}
                      </button>
                    ))}
                  </div>
                )}
                <div className="row mt-16">
                  <button className="btn" onClick={onBack}>Back</button>
                  {selected.page_type !== "database" && (
                    <button className="btn" onClick={() => createFromTemplate("blank", selected.id)}>Add subpage</button>
                  )}
                  <button className="btn" onClick={duplicatePage}>Duplicate</button>
                  {selected.page_type !== "database" && (
                    <>
                      <button className="btn" onClick={() => exportMarkdown(false)}>
                        {copied ? "Copied!" : "Copy markdown"}
                      </button>
                      <button className="btn" onClick={() => exportMarkdown(true)}>Download .md</button>
                    </>
                  )}
                  {confirmDelete ? (
                    <span className="row">
                      <button className="btn small" onClick={removeSelected}>Yes, delete “{selected.title}”</button>
                      <button className="btn ghost small" onClick={() => setConfirmDelete(false)}>Keep</button>
                    </span>
                  ) : (
                    <button className="btn ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
