# Quality Hardening Implementation Plan

> **For agentic workers:** Native execution, same session. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Prove RecallLoop behaves for three student personas via Playwright, then fix every friction/security/perf issue found, across frontend, backend, and AI layers.

**Architecture:** `frontend/playwright.config.ts` + `frontend/tests/` (fixtures + 3 persona specs). Fixes land in existing files; no new backend endpoints, no new deps except `@playwright/test` (already added).

**Tech Stack:** Playwright 1.64 + Chromium, pytest, Vite build.

**Spec:** `skills/recallloop-e2e/SKILL.md` + `PERSONAS.md`; graphify `graphify-out/GRAPH_REPORT.md` (no import cycles; centers: create_app, StudySession, grade_exam, App).

## Global Constraints

- Dev servers only: backend :8011, frontend :5173 with VITE_API_TARGET set.
- Exactly one `@model` test (crammer exam generation); everything else deterministic.
- No RAG/chat framing in copy; no secrets in tests or logs.
- Fix the cause; never silence a failing assertion.

## Review Focus

- A journey step that passes alone but fails in sequence (shared-state leak).
- A fix that quiets the test but leaves the user-facing friction (e.g. hiding an error instead of guiding).
- A security fix that breaks the demo (e.g. blocking the share link).
- Model-call changes that raise demo cost or latency.

---

### Task M1: Playwright harness (config + fixtures)

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/tests/fixtures.ts`

**Interfaces:**
- Produces: `gotoHome(page)`, `openPagesFor(page, index)`, `expectClean(page)` (zero console errors + zero 4xx/5xx API responses).

- [ ] **Step 1:** Write config (baseURL localhost:5173, chromium, trace on failure, reporter list).
- [ ] **Step 2:** Write fixtures (console/pageerror listeners, requestfailed + response-status collectors).
- [ ] **Step 3:** Run `npx playwright test --list`. Expected: lists specs (none yet — then M2).

### Task M2: Three persona journeys

**Files:**
- Create: `frontend/tests/crammer.spec.ts`, `organizer.spec.ts`, `voice.spec.ts`

- [ ] **Step 1 (crammer):** home → New session → demo course → blueprint → generate (`@model`, timeout 180s) → answer all → submit → results visible → remediation built. Record wall time per stage.
- [ ] **Step 2 (organizer):** open pages → new template page → tracker add/status → board move → wikilink round-trip → pin/search/duplicate/export. Assert each persists after reload where applicable.
- [ ] **Step 3 (voice):** open assistant → "open pages" lands → "show planner" lands → "open raft" lands → "note down X" appends (verify in notes). Intent-hit rate 4/4.
- [ ] **Step 4:** Run full suite, collect failures + timings into findings list.

### Task M3: Fix round 1 — friction from findings

- [ ] Fix each M2 finding at its cause; re-run affected journey. Expected: green.

### Task M4: Security pass (guidance mode)

Scope: backend `api.py/service.py` boundaries, frontend XSS surfaces (quotes rendered into DOM, markdown export), share-token strength, upload validation, secrets handling.

- [ ] **Step 1:** Review share/duplicate/upload/notes/pages inputs for injection, auth gaps, enumeration.
- [ ] **Step 2:** Review frontend rendering of server/model strings (quotes, stems, notes) for HTML injection.
- [ ] **Step 3:** Fix confirmed issues at last trusted decision point; add regression tests in pytest where backend.

### Task M5: Perf + AI robustness

- [ ] Backend: time slowest endpoints (generate/submit/remediate) on seeded data; fix N+1s (e.g. per-topic queries in loops) only if measured >200ms.
- [ ] Frontend: bundle check (`npm run build` size), remove dead code (`notes.ts` — confirm with user first).
- [ ] AI layer: verify model timeout/repair path still holds (120s), one repair max; confirm demo needs zero model calls.

### Task M6: Final verification

- [x] `pytest -q` 79 green, extension tests 23 green, `npm run build` clean.
- [x] Full Playwright suite green with zero console errors.
- [x] Real-user browser spot-pass of fixed areas.
- [x] Report: behavior data (timings, hit rates), fixes, deferred items.

## Results (2026-11-01)

- M1 harness: 3 journeys listed and run.
- M2 crammer: GREEN 3.7s (blueprint 885ms, generate 144ms cached, grade ~1.2s, remediation + retest built).
- M2 organizer: GREEN after 5 fixes (2 test bugs, 3 app bugs).
- M2 voice: GREEN, 4/4 intents first-try.
- M3 fixes: immediate persist on discrete saves; sidebar grid track minmax; tolerant search; named delete confirm; assistant help copy.
- M4 security: bounded upload/audio reads + regression tests; audit clean (npm 0 vulns, no secrets, no raw SQL/XSS surfaces).
- M5 perf: endpoints 1-105ms, bundle 360KB/109KB gzip, AI layer intact (120s + 1 repair).
- Open: dead code `frontend/src/notes.ts` (973B, zero importers) — needs user confirm before delete.
- Deferred: cold-model generation timing (cache hit measured instead; cold path verified live earlier).
