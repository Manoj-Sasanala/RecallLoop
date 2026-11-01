# Notion-parity milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (native execution, same session). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port four more Notion features into RecallLoop pages (board view, page links, sidebar power-ups, diagnosis fill upgrade) with zero backend changes, then verify everything end-to-end.

**Architecture:** All state lives in existing `NotePage.properties` JSON (view, pinned, rows). New code is frontend-only: one new component (board), one helper (wikilinks), extensions to PagesView/PageTemplates. Verification is `npm run build` + `pytest -q` + live-browser real-user pass with zero console errors.

**Tech Stack:** React + TS (Vite), existing `fetch` api.ts client, SQLModel backend (untouched).

**Spec:** Notion public help center (databases, database views, database templates) + this repo's `backend/app/service.py` pages API (list/create/update/delete) and `frontend/src/components/PagesView.tsx` conventions (debounced persist, panel/btn/row classes).

## Global Constraints

- No new backend endpoints, no schema changes, no new npm dependencies.
- No model calls: templates and fill are deterministic, built from graded data already on screen.
- No "RAG"/chat-tutor framing anywhere in UI copy (hackathon rule).
- Autosave everywhere with Saved/Saving chip; two-step confirm for deletes.
- Keep components under ~200 lines; reuse `.table`, `.panel`, `.btn`, `.row`, `.lede` tokens.

## Review Focus

- Board groups rows missing a Status value under "Not started" (reasonable default, not dropped).
- `[[Title]]` matching is case-insensitive and ignores the page itself (no self-links).
- Pinned pages sort above unpinned, keeping creation order within each group.
- Duplicate copies content + properties but gets a fresh id and " (copy)" title (never clones the id).
- Fill-from-diagnosis on a session with no graded rounds shows guidance, not an empty table.

---

### Task M1: Board view for database pages

**Files:**
- Create: `frontend/src/components/BoardView.tsx`
- Modify: `frontend/src/components/DatabaseTable.tsx` (add `view` prop? no — keep; BoardView reads same properties shape), `frontend/src/components/PagesView.tsx` (view switcher Table/Board persisted in `properties.view`)

**Interfaces:**
- Consumes: `readTable(properties) -> { columns, rows }` from DatabaseTable.tsx.
- Produces: `BoardView({ properties, onMove })` where `onMove(rowIndex, status)` updates the Status cell; PagesView persists via existing `saveProps`.

- [ ] **Step 1: Write BoardView.tsx** — columns Not started/Learning/Mastered; cards show Topic + Trap + Reviews; `<select>` per card moves status via `onMove`. Rows without Status land in Not started.
- [ ] **Step 2: Wire switcher in PagesView** — Table | Board buttons above the table; switching calls `saveProps({ ...draftProps, view })`; render `BoardView` when `draftProps.view === "board"`.
- [ ] **Step 3: Verify in browser** — open tracker, switch to Board, move a card, reload, confirm it stayed. Expected: persisted + zero console errors.
- [ ] **Step 4: Run `npm run build`** in frontend. Expected: clean.

### Task M2: [[Page links]] + Linked-from section

**Files:**
- Create: `frontend/src/components/PageLinks.ts` (`parseWikilinks(md) -> string[]`, `findBacklinks(pages, title) -> NotePage[]`, case-insensitive, excludes self)
- Modify: `frontend/src/components/PagesView.tsx` (render links as jump buttons above editor; "Linked from" section listing pages that mention this title, click to jump)

**Interfaces:**
- Consumes: `pages: NotePage[]`, `selected: NotePage`, `setSelectedId`.
- Produces: nothing (render-only).

- [ ] **Step 1: Write PageLinks.ts** — `/\[\[([^\]]+)\]\]/g` titles; match against page titles case-insensitively; skip self.
- [ ] **Step 2: Render in PagesView** — "Links" row (buttons jump to linked pages; unknown titles render as plain text, not links); "Linked from" list under the editor.
- [ ] **Step 3: Verify in browser** — add `[[Misconceptions & Traps Tracker]]` to General Notes, click it, land on tracker; tracker shows General Notes under Linked from. Expected: both directions + zero console errors.
- [ ] **Step 4: Run `npm run build`**. Expected: clean.

### Task M3: Sidebar power-ups (search, pin, duplicate, export)

**Files:**
- Modify: `frontend/src/components/PagesView.tsx`, `frontend/src/api.ts` (no new fns needed — uses list/create/update/delete), `frontend/src/styles.css` (search input row, pin glyph)

**Interfaces:**
- Consumes: existing `createNotePage/updateNotePage/deleteNotePage`.
- Produces: pinned sort + `properties.pinned`; duplicate via create with `" (copy)"` suffix.

- [ ] **Step 1: Search filter** — input above list filters top-level + subpages by title (case-insensitive); empty match shows "No pages match."
- [ ] **Step 2: Pin/unpin** — pin button per page toggles `properties.pinned`; pinned sort first, creation order within groups.
- [ ] **Step 3: Duplicate page** — button copies title/content/properties to a new page titled `"<title> (copy)"`, selects it.
- [ ] **Step 4: Export** — Copy markdown (clipboard) + Download `.md` (blob) buttons in editor header for `page` type.
- [ ] **Step 5: Verify in browser** — search narrows list; pin reorders; duplicate appears and persists after reload; download produces the file; copy writes clipboard. Expected: all + zero console errors.
- [ ] **Step 6: Run `npm run build`**. Expected: clean.

### Task M4: Diagnosis fill upgrade + two more templates

**Files:**
- Modify: `frontend/src/components/PageTemplates.ts` (add `examday`, `weekly` templates), `frontend/src/components/PagesView.tsx` (fill adds Review-on column + review dates)

**Interfaces:**
- Consumes: `getRevision(sessionId) -> { items: RevisionItem[] }` (already imported in PagesView).
- Produces: fill rows `[topic, trap, "Not started", "0", review_on]`; ensure TRAP_COLUMNS gains "Review on" without breaking existing saved rows (missing cells render "—").

- [ ] **Step 1: Extend TRAP_COLUMNS** with "Review on" in DatabaseTable.tsx; cells beyond row length render empty (already does via `row[col] ?? ""`).
- [ ] **Step 2: Upgrade fillFromDiagnosis** — include `review_on` per row; weak-first ordering stays.
- [ ] **Step 3: Add templates** — `examday` (Exam-day checklist: sleep/pack/breathe + quote review) and `weekly` (Weekly review: wins/misses/plan) in PAGE_TEMPLATES + templateContent.
- [ ] **Step 4: Verify in browser** — fill shows dates; both templates create with structure; old saved rows still render. Expected: all + zero console errors.
- [ ] **Step 5: Run `npm run build`**. Expected: clean.

### Task M5: Final full verification

- [ ] **Step 1: Backend** — run `pytest -q` in backend. Expected: 78 passed.
- [ ] **Step 2: Extension** — run `node --test "extensions/chrome-personal/tests/*.mjs"`. Expected: 22 passed.
- [ ] **Step 3: Real-user browser pass** — fresh reload: open Pages, edit notes, table add/status, board move, wikilink jump both ways, search, pin, duplicate, export, template create, subpage, delete, assistant "open pages" + "open raft". Expected: every step works, zero console errors.
- [ ] **Step 4: Report** — what works, what was skipped, risks.
