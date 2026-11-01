---
name: recallloop-e2e
description: Run RecallLoop's Playwright end-to-end student journeys (crammer, organizer, voice-assistant user) against local dev servers. Use when testing the full app in a real browser, adding e2e coverage, or reproducing a UI bug.
---

# RecallLoop E2E

## Quick start

```bash
# 1. Backend on :8011 (from F:\Recalloop\backend)
..\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8011
# 2. Frontend on :5173 with proxy to backend (from F:\Recalloop\frontend)
$env:VITE_API_TARGET="http://127.0.0.1:8011"; npm run dev -- --port 5173 --strictPort
# 3. Run journeys (from F:\Recalloop\frontend)
npx playwright test
```

## Workflows

### Add a journey

1. Persona first: who is this student, what is their goal, what is their hurry.
2. New file in `frontend/tests/*.spec.ts`; reuse `fixtures.ts` helpers (gotoHome, openPages, noConsoleErrors).
3. Deterministic paths only, except ONE tagged `@model` test allowed to call the LLM (exam generation). Tag it: `test('...', { tag: '@model' }, ...)`.
4. Every journey asserts: zero console errors, zero failed API requests (collect via fixtures).

### Triage a failure

1. Read `test-results/` trace: `npx playwright show-report`.
2. Repro with headed browser: `npx playwright test -g "name" --headed`.
3. Real-user check: repeat the exact clicks in a live browser before fixing.

## Rules

- Tests never touch production data; dev DB `backend/recallloop.db` is disposable.
- No secrets in tests; model-backed tests use the dev `.env` key, never log it.
- Keep journeys under 60 steps; split personas, not files.
- See [PERSONAS.md](PERSONAS.md) for the three student profiles and what each proves.
