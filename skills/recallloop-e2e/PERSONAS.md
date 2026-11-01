# Student personas (behavior basis)

These stand in for real-student observation (no telemetry in the app).
Each persona is a Playwright journey in `frontend/tests/`.

## 1. Crammer (exam tomorrow)

Goal: fastest path from landing to graded answers.
Proves: setup → blueprint → generate → answer → submit → results works
under time pressure. Measures time-to-first-question and counts misclicks
(wrong-button clicks, backtracks). One `@model` test: real exam generation
timing is the most valuable datum — keep it, run it sparingly.

## 2. Organizer (steady reviser)

Goal: build a study system, not sit an exam.
Proves: pages CRUD, trap-tracker table add/status, board move, wikilinks
both ways, pin/search/duplicate/export, templates. Measures steps-per-task
(anything over ~5 clicks for "add a trap" is a friction finding).

## 3. Voice student (hands busy)

Goal: drive the app by voice/text commands.
Proves: assistant intents (open pages/planner/progress, weak topics,
note down, navigate views). Typed commands stand in for speech here —
the speech pipeline itself was verified separately with synthetic audio.
Measures intent-hit rate: commands that land first try vs fallbacks.
