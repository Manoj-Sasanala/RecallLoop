# RecallLoop — 3-Minute Demo Video Script

Record at 1080p, screen + voiceover. Use a **seeded demo bundle** (zero model calls, zero latency risk).
Rehearse once with a timer. Target: 2:50 to leave a 10-second buffer.

## Setup before recording

1. Backend + frontend running (`./run_demo.sh`), browser at 100% zoom, notifications off.
2. Open the app on the setup screen. Have this script's talking points nearby.

## 0:00–0:25 — Hook (fluency illusion)

**On screen:** Setup screen with the two seeded courses.

**Say:**
> "Reading the same chapter five times feels like learning. It isn't — researchers call it the
> fluency illusion: recognition mistaken for recall. Testing beats rereading, 80% retention
> versus 33% a week later. RecallLoop is a simulator that finds out what you actually know:
> you upload your course material, sit a timed exam, get told exactly which misconceptions
> you carry, and prove the fix on a new exam. Watch."

## 0:25–0:55 — Sources + blueprint

**On screen:** Click **CS-451 Raft**. Blueprint appears: 2 topics, weights, page ranges. Scroll to the
dependency graph; hover a node.

**Say:**
> "I start the instant Raft course — no upload wait. The blueprint maps two topics to real
> pages with exam weights, and this graph shows the prerequisite chain: leader election
> unlocks log replication. Every question later cites a verbatim line from the source."

## 0:55–1:35 — Timed exam + confidence

**On screen:** Generate the exam. Answer 6 questions (answer 2–3 deliberately wrong but
**Confident** — say so out loud). Timer visible.

**Say:**
> "Six questions, ten minutes. The twist is the confidence toggle: every answer needs a
> Guessing or Confident. A confident wrong answer is a misconception; a hesitant one is
> just a gap. I'm deliberately falling into traps here so you can see the diagnosis."

## 1:35–2:15 — Diagnosis + source drawer

**On screen:** Submit. Show the 2×2 matrix (lure cells lit), topic mastery, then **Open source**
on a missed item — quote highlighted on the page.

**Say:**
> "Fifty percent accuracy — but look at the matrix: three lure entrapments. The engine names
> the exact wrong belief, and every item links to the source line that disproves it,
> highlighted on the real page. No black box, no chatbot — deterministic grading."

## 2:15–3:00 — Remediation, retest, delta, export

**On screen:** Build remediation → briefing → card → start retest → answer all correctly →
delta scorecard ("The gap closed", +50 pts, 100% lures resolved) → Export study page.

**Say:**
> "One remediation card per weak topic: the trap, the source truth, a worked example.
> A new exam on the same ideas — unfamiliar stems, so memorization can't save me.
> Mastery doubled, every lure resolved. And the whole session exports as a study page
> for my own notes. Measure, repair, prove — that's RecallLoop."

## If something goes wrong live

- Generation slow? You're on the seeded bundle — there are no model calls. Nothing can stall.
- Misclick? Keep going; the delta only needs two graded rounds.
- Out of time? Cut the graph hover (0:45) and the second retest question — never cut the delta.
