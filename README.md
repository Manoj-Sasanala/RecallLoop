# RecallLoop — exam readiness, measured

Upload your course material. Sit a source-grounded exam. Get a measured diagnosis of the misconceptions you carry. Prove the fix on a new exam.

Built for the **Meta Global AI Developer Hackathon 2026 (Indie track)**. No chat UI, no retrieval layer — the full 1M-token context window holds the document, every question cites a verbatim line from the source, and grading is a deterministic engine (same answers → same scores, every time).

## The loop

1. **Sources** — upload PDFs (slides, notes, textbook chapters) or start a seeded demo course instantly.
2. **Blueprint** — the model maps the material into topics with page ranges, exam weights, and prerequisite edges.
3. **Diagnostic exam** — timed, per-item confidence (Guessing / Confident). New stems, never repeated.
4. **Diagnosis** — a 2×2 matrix (confidence × correctness) classifies each answer: Mastered, Fragile guess, Recognised gap, Lure entrapment. Topics are ranked by vulnerability = (1 − mastery) × weight × (1 + 0.25 × dependents).
5. **Remediation** — one card per weak topic: the trapped misconception, the source line that contradicts it, and a worked example.
6. **Proof** — a targeted retest on the same ideas with new questions, then a before/after delta (mastery, accuracy, calibration, lure resolution).

## Quickstart

**Backend** (Python 3.13):

```bash
cd backend
pip install -r ../requirements.txt
uvicorn app.main:app --port 8000
```

**Frontend** (Node 24):

```bash
cd frontend
npm install
npm run dev
```

**Zero-setup demo** (no model calls, no keys): open the UI, pick *CS-451 Raft* or *MED-512 Heart failure*. The seeded bundle path never touches the network.

## Configuration

Copy `.env.example` to `.env`:

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | `deepseek` (dev stand-in) or `meta` (submission target) |
| `DEEPSEEK_API_KEY` | dev key |
| `META_API_KEY` | Meta Model API key — required when `LLM_PROVIDER=meta` |

One-line switch, no code changes: the provider layer speaks OpenAI chat-completions shape for both.

## Tests

```bash
cd backend
python -m pytest -q   # 66 tests: grading engine, verification gate, models, ingestion, orchestrator, full API loop
```

`tests/test_api.py` walks the entire demo loop: create session → generate → submit → remediate → retest → delta → source page fetch.

## Architecture

- `backend/app/ingestion.py` — PyMuPDF text + 150-DPI page images; invisible/zero-size text stripped; encrypted, blank, and oversized PDFs rejected.
- `backend/app/llm.py` — provider-agnostic client (`FakeClient` for tests, `OpenAICompatClient` for DeepSeek/Meta).
- `backend/app/orchestrator.py` — evidence-first generation: canonical XML prefix, cache hash, HTML escaping, one repair call for failed items.
- `backend/app/verification.py` — the gate every question must pass: 4 options, exactly one correct, verbatim quote with ≥0.85 match against the cited page, option-length tolerance ±35%.
- `backend/app/grading.py` — deterministic scoring, zero model calls. Deficit weights: Mastered 0.0, Fragile 0.3, Gap 0.5, Lure 1.0.
- `backend/app/bundles.py` — seeded demo courses (6 + 4 questions each).
- `frontend/src` — React + TypeScript, no router, no UI framework. One small state machine: setup → blueprint → exam → results → remediation → retest → delta.

## What this is not

Not a chatbot, not flashcards, not a quiz generator. It does not summarize your document — it measures whether *you* learned it, names the exact wrong belief, and makes you prove the repair.
