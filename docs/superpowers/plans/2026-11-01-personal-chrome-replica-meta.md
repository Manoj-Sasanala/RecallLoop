# Personal Chrome Replica (Meta API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unpacked MV3 side-panel agent that drives the active tab like Claude for Chrome but calls the user's Meta key.

**Architecture:** Service worker owns the loop `snapshot → Meta JSON action → execute → observe`; content scripts supply accessibility tree + cursor overlay; sidepanel is thin view; offscreen keeps SW alive; no Anthropic endpoints, no copied bundle code.

**Tech Stack:** Chrome MV3, vanilla JS, Meta Llama OpenAI-compat `chat/completions`, `chrome.storage.local` only.

**Spec:** `docs/superpowers/specs/2026-11-01-personal-claude-chrome-replica-meta-design.md`

## Global Constraints
- Personal unpacked extension only, Chrome 116+.
- Clean-room: own code/CSS/icons, no `fcoeoab...` bundle assets or fonts.
- Key in `chrome.storage.local` (`metaApiKey, metaModel, baseUrl=https://api.llama.com/compat/v1`); never sync, log, or send elsewhere.
- `activeTab`-first; add `<all_urls>` + `debugger` only if DOM execution proves insufficient.
- Ask-before-act on new domain + before click/type/submit; 15-step cap; stop on tab close/navigate-away.
- Static analysis only so far; no runtime proof claimed.

## Review Focus
- Page text/URL sent to Meta on every step — user expects only active-tab content, redacted inputs, nothing stored.
- Model returns non-JSON or unknown action — user expects stop with message, no blind click.
- System pages (`chrome://`, store) reject injection — user expects graceful "navigate-only" notice.
- SW killed mid-run (MV3 30s) — user expects keepalive + resume or clean stop.
- Key missing/invalid — user expects options prompt, no loop start.

---

### Task 1: Scaffold + key storage

**Files:**
- Create: `extensions/chrome-personal/manifest.json`
- Create: `extensions/chrome-personal/options.html`
- Create: `extensions/chrome-personal/options.js`
- Test: `extensions/chrome-personal/tests/validate-manifest.mjs`

**Interfaces:**
- Consumes: none.
- Produces: `chrome.storage.local {metaApiKey, metaModel, baseUrl}`; `GET_OPTIONS()` shape used by Tasks 2,5,6.

- [ ] **Step 1: Write failing test** `tests/validate-manifest.mjs` asserts manifest MV3, side_panel, service worker path, permissions subset of `[sidePanel,storage,activeTab,scripting,tabs,alarms,notifications,offscreen]`, no `<all_urls>`.
- [ ] **Step 2: Run test to verify it fails** Run: `node extensions/chrome-personal/tests/validate-manifest.mjs` Expected: FAIL missing files.
- [ ] **Step 3: Implement manifest + options page** minimal `manifest.json` + options form saving key/model/baseUrl to local only.
- [ ] **Step 4: Run test to verify it passes** Run same command Expected: PASS.
- [ ] **Step 5: Commit** `git add extensions/chrome-personal docs/superpowers/plans/...; git commit -m "feat: scaffold personal chrome replica with local key storage"`

### Task 2: Meta client

**Files:**
- Create: `extensions/chrome-personal/lib/meta-client.js`
- Test: `extensions/chrome-personal/tests/meta-client.test.mjs`

**Interfaces:**
- Consumes: options shape from Task 1.
- Produces: `chatAction({messages, tools}) -> {action JSON | text}` used by Task 5.

- [ ] **Step 1: Write failing test** parsing of action JSON `{"tool":"click","ref":"ref_3"}` + missing-key error, no network.
- [ ] **Step 2: Run test** `node --test extensions/chrome-personal/tests/meta-client.test.mjs` Expected: FAIL.
- [ ] **Step 3: Implement `meta-client.js`** OpenAI-compat fetch, system prompt with tab context, JSON-action fallback, 120s timeout.
- [ ] **Step 4: Run test** Expected: PASS.
- [ ] **Step 5: Commit**

### Task 3: Accessibility snapshot

**Files:**
- Create: `extensions/chrome-personal/content/accessibility.js`
- Test: `extensions/chrome-personal/tests/accessibility.test.mjs`

**Interfaces:**
- Consumes: none.
- Produces: `window.__personalSnapshot(filter,depth) -> {tree, refs}` used by Task 5.

- [ ] **Step 1: Write failing test** with tiny DOM fixture asserting role/name/ref format `button "Search" [ref_1]`, depth cap, 50k char cap.
- [ ] **Step 2: Run test** Expected: FAIL.
- [ ] **Step 3: Implement walker** ARIA roles, aria-label/placeholder/text naming, `WeakMap` refs, `read_page`-compatible output.
- [ ] **Step 4: Run test** Expected: PASS.
- [ ] **Step 5: Commit**

### Task 4: Cursor overlay

**Files:**
- Create: `extensions/chrome-personal/content/cursor.js`
- Test: manual load check (no DOM assert needed beyond element creation).

**Interfaces:**
- Consumes: action events from Task 5.
- Produces: `showCursor(x,y,click)` overlay.

- [ ] **Step 1: Write failing check** script asserts overlay div created/hidden on message.
- [ ] **Step 2: Run** Expected: FAIL.
- [ ] **Step 3: Implement** 24px dot, translate transform, auto-hide 400ms.
- [ ] **Step 4: Run** Expected: PASS.
- [ ] **Step 5: Commit**

### Task 5: Service-worker agent loop

**Files:**
- Create: `extensions/chrome-personal/service-worker.js`
- Create: `extensions/chrome-personal/lib/actions.js`
- Test: `extensions/chrome-personal/tests/actions.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: `runTask(tabId, goal)` + permission gates used by Task 6.

- [ ] **Step 1: Write failing test** action schema validation: allow `navigate/read/click/type/scroll/js/screenshot/stop`, reject unknown, enforce confirm-before-click/type on new domain.
- [ ] **Step 2: Run test** Expected: FAIL.
- [ ] **Step 3: Implement loop** snapshot via `chrome.scripting.executeScript`, Meta call via Task 2, execute via scripting (click via ref lookup, type via trusted events), system-page guard (`navigate` only), 15-step cap, cancel via Stop.
- [ ] **Step 4: Run test + `node --check` on worker** Expected: PASS.
- [ ] **Step 5: Commit**

### Task 6: Sidepanel + offscreen keepalive

**Files:**
- Create: `extensions/chrome-personal/sidepanel.html`, `sidepanel.js`, `sidepanel.css`
- Create: `extensions/chrome-personal/offscreen.html`, `offscreen.js`
- Test: `node extensions/chrome-personal/tests/validate-manifest.mjs` + manual `chrome://extensions` load.

**Interfaces:**
- Consumes: Task 5 `runTask`, Task 1 options.
- Produces: working unpacked extension.

- [ ] **Step 1: Write failing check** sidepanel sends goal + shows steps; offscreen pings `SW_KEEPALIVE` every 20s.
- [ ] **Step 2: Run** Expected: FAIL.
- [ ] **Step 3: Implement** minimal chat log, goal input, Stop button, missing-key banner linking to options; offscreen interval + notification sound hook.
- [ ] **Step 4: Verify** load unpacked, open sidepanel on example.com, run read-only summarize task.
- [ ] **Step 5: Commit**
