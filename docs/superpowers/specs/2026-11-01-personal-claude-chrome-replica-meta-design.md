# Personal Claude-style Chrome Extension Replica (Meta API) — Design

Date: 2026-11-01. Personal use only, clean-room reimplementation from REA observations. No Anthropic code, assets, or endpoints reused.

## Intent and why
Replicate the feel of Claude for Chrome v1.0.104 for one user: side panel chat on any tab, page-aware, able to drive the page (click/type/scroll), but calling the user's Meta API key/model instead of claude.ai. REA evidence: manifest MV3 `sidePanel,storage,activeTab,scripting,debugger,tabs,alarms,notifications,webNavigation,offscreen,nativeMessaging`, service worker `service-worker.ts-DAVE5h6d.js` with `wss://bridge.claudeusercontent.com` keepalive, content scripts `accessibility-tree`, `cursor-motion`, `agent-visual-indicator`, sidepanel bundle 1.77MB with MCP/API URLs.

## Goals
- Side panel opens via toolbar + Ctrl/Command+E, chats against page context.
- Options page pastes Meta API key + model id, stored only in `chrome.storage.local`.
- Page control loop: snapshot simplified accessibility tree, model picks one action (click/type/scroll/select/navigate), extension executes via content script, shows cursor overlay + step log, asks before sensitive actions.
- MV3-safe: service worker + offscreen keepalive (20s ping like original), alarms for retries, notifications on done.
- Works only for owner: no sync storage, no external backend, no telemetry.

## Non-goals / anti-goals
- No claude.ai login, no Anthropic bridge, no MCP gdrive/calendar connectors in v1.
- No publishing to Chrome Web Store, no multi-user auth, no `chrome.storage.sync`.
- Failure = copying bundle JS/CSS/fonts/icons verbatim, phoning home to Anthropic/Sentry/Datadog, or persisting the key anywhere but local.
- No silent autonomous purchases, form submissions with PII, or debugger use without visible banner consent.

## Constraints
- Chrome 116+, MV3 (30s SW idle kill → offscreen keepalive required).
- Meta Llama API is OpenAI chat-completions shaped; tool/function calling support varies by model — design action loop to work with JSON-action-in-text fallback.
- `<all_urls>` + `debugger` trigger install warnings; acceptable for self-loaded unpacked extension only.
- Clean-room: own React-free sidepanel HTML/CSS/JS, own icons; KaTeX/fonts omitted in v1 (plain markdown).

## Approaches
1. **Direct sidepanel + Meta fetch (recommended against for this goal).** Sidepanel fetches Meta directly, one content script reads page text. Small, but no tab driving, no keepalive — fails the "controls Chrome like theirs" requirement.
2. **Faithful local replica (picked).** MV3 service worker owns the agent loop + Meta calls; offscreen doc keeps SW alive + plays notification sound; content scripts build accessibility snapshot and cursor overlay; sidepanel is thin view. Matches observed original architecture without their server. Costs more code but is the only way to drive pages.
3. **Patch/unpack original bundle (rejected).** Brittle, copies proprietary code, breaks on next update.

Picked 2 because the user explicitly wants exact control behavior; 1 cannot do it, 3 is disallowed.

## What is decided
- Unpacked MV3 extension in repo, e.g. `extensions/chrome-personal/`: `manifest.json`, `service-worker.js`, `sidepanel.html/js`, `options.html/js`, `offscreen.html/js`, `content/accessibility.js`, `content/cursor.js`.
- Agent loop lives in service worker: `snapshot → Meta chat with JSON action → execute in tab → observe → repeat`, max ~15 steps, stop on done/deny.
- Key entry in options page, `chrome.storage.local {metaApiKey, metaModel, baseUrl default https://api.llama.com/compat/v1}`; sidepanel shows connected/missing state.
- Permissions minimal for v1: `sidePanel,storage,activeTab,scripting,tabs,alarms,notifications,offscreen`; add `debugger` only if CDP needed — prefer scripting+DOM first.

## Left to builder
- Exact Meta model id default and base URL confirmation at build time.
- Final action JSON schema and confirmation UX copy.
- Step budget and per-site denylist defaults.
