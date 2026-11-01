"""Deterministic grading engine. Zero LLM calls, zero I/O.

The PRD states the formulas as images; the values below are the single place to
tune them. Definitions:

raw_accuracy        correct items / items
deficit weight      MASTERED 0.0, FRAGILE_GUESS 0.3, RECOGNIZED_GAP 0.5,
                    LURE_ENTRAPMENT 1.0 (PRD 2x2 matrix, gamma_i)
mastery_score       1 - mean(deficit weight) per topic
mce_score           mean |confidence - correctness| (binary Brier score)
lure_persistence    entrenched misconception tags / tags exposed in round 1
vulnerability       (1 - mastery) * syllabus_weight * (1 + 0.25 * out_degree)
weak topic          mastery < 0.6 OR any LURE_ENTRAPMENT, top N by vulnerability
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence
from uuid import UUID

from app.models import DiagnosticState, Question

CONFIDENCE_LOW = 0
CONFIDENCE_HIGH = 1
WEAK_MASTERY_THRESHOLD = 0.6

# PRD gamma_i: cognitive deficit weight per diagnostic state.
DEFICIT_WEIGHTS = {
    DiagnosticState.MASTERED: 0.0,
    DiagnosticState.FRAGILE_GUESS: 0.3,
    DiagnosticState.RECOGNIZED_GAP: 0.5,
    DiagnosticState.LURE_ENTRAPMENT: 1.0,
}

STATE_ORDER = (
    DiagnosticState.MASTERED,
    DiagnosticState.FRAGILE_GUESS,
    DiagnosticState.RECOGNIZED_GAP,
    DiagnosticState.LURE_ENTRAPMENT,
)


@dataclass(frozen=True)
class Response:
    question_id: UUID
    selected_option_id: str
    confidence_level: int
    time_spent_ms: int = 0


@dataclass(frozen=True)
class TopicMeta:
    topic_id: UUID
    title: str = ""
    syllabus_weight: float = 1.0
    out_degree: int = 0


@dataclass(frozen=True)
class GradedItem:
    question_id: UUID
    topic_id: UUID
    selected_option_id: str
    correct_option_id: str
    confidence_level: int
    is_correct: bool
    diagnostic_state: DiagnosticState
    penalty_weight: float
    endorsed_misconception: str | None
    time_spent_ms: int = 0

    @property
    def mastery_credit(self) -> float:
        return 1.0 - self.penalty_weight


@dataclass(frozen=True)
class TopicResult:
    topic_id: UUID
    title: str
    raw_accuracy: float
    mastery_score: float
    vulnerability_score: float
    is_flagged_weak: bool
    trapped_misconceptions: tuple[str, ...] = ()


@dataclass(frozen=True)
class GradedExam:
    raw_accuracy: float
    mastery_score: float
    mce_score: float
    lure_persistence_rate: float
    state_counts: dict[str, int]
    items: tuple[GradedItem, ...] = ()
    topics: tuple[TopicResult, ...] = ()
    weak_topic_ids: tuple[UUID, ...] = ()


def classify(is_correct: bool, confidence_level: int) -> DiagnosticState:
    confident = confidence_level == CONFIDENCE_HIGH
    if is_correct:
        return DiagnosticState.MASTERED if confident else DiagnosticState.FRAGILE_GUESS
    return DiagnosticState.LURE_ENTRAPMENT if confident else DiagnosticState.RECOGNIZED_GAP


def _validate_confidence(value: int) -> int:
    if value not in (CONFIDENCE_LOW, CONFIDENCE_HIGH):
        raise ValueError(f"confidence_level must be 0 or 1, got {value!r}")
    return value


def _option_lookup(question: Question) -> dict[str, dict]:
    options = {opt["option_id"]: opt for opt in question.options_json}
    if question.correct_option_id not in options:
        raise ValueError(f"question {question.id} has no option {question.correct_option_id!r}")
    return options


def grade_item(question: Question, response: Response) -> GradedItem:
    options = _option_lookup(question)
    if response.selected_option_id not in options:
        raise ValueError(
            f"response {response.question_id} selected unknown option {response.selected_option_id!r}"
        )
    confidence = _validate_confidence(response.confidence_level)
    is_correct = response.selected_option_id == question.correct_option_id
    state = classify(is_correct, confidence)
    selected = options[response.selected_option_id]
    return GradedItem(
        question_id=question.id,
        topic_id=question.topic_id,
        selected_option_id=response.selected_option_id,
        correct_option_id=question.correct_option_id,
        confidence_level=confidence,
        is_correct=is_correct,
        diagnostic_state=state,
        penalty_weight=DEFICIT_WEIGHTS[state],
        endorsed_misconception=None if is_correct else selected.get("misconception_type"),
        time_spent_ms=response.time_spent_ms,
    )


def _mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def vulnerability(mastery: float, syllabus_weight: float, out_degree: int) -> float:
    weight = syllabus_weight if syllabus_weight > 0 else 1.0
    return (1.0 - mastery) * weight * (1.0 + 0.25 * out_degree)


def paced_time_limit(
    word_counts: Sequence[int],
    per_item_buffer_s: int = 20,
    wpm: int = 150,
    minimum_s: int = 120,
) -> int:
    """Cognitive pacing clock: Understand-rate reading + retrieval buffer/item.

    150 WPM for stems/options, 20s per item for retrieval + confidence judgment.
    """
    total = sum(max(0, w) for w in word_counts)
    return max(minimum_s, round(total / (wpm / 60) + per_item_buffer_s * len(word_counts)))


def behavior_persona(
    items: Sequence[GradedItem],
    weak_topic_ids: Iterable[UUID] = (),
    edges: Iterable[tuple[UUID, UUID]] = (),
) -> dict:
    """Deterministic failure-mode label from telemetry (no model).

    Priority: prerequisite cascade > impulsive lure > slow gap > fragile
    guessing > steady. Thresholds are documented, not tuned.
    """
    items = list(items)
    weak = set(weak_topic_ids)
    lure_fast = [
        i
        for i in items
        if i.diagnostic_state is DiagnosticState.LURE_ENTRAPMENT and i.time_spent_ms < 8000
    ]
    slow_gap = [
        i
        for i in items
        if i.diagnostic_state is DiagnosticState.RECOGNIZED_GAP and i.time_spent_ms > 45000
    ]
    fragile = [i for i in items if i.diagnostic_state is DiagnosticState.FRAGILE_GUESS]

    cascade = [
        (pre, dep)
        for pre, dep in edges
        if pre in weak and dep in weak and pre != dep
    ]
    if cascade:
        return {
            "persona": "PREREQUISITE_BOTTLENECK",
            "detail": "Downstream and upstream topics both weak: fix the prerequisite first.",
            "counts": {"cascade_pairs": len(cascade)},
        }
    if lure_fast:
        return {
            "persona": "IMPULSIVE_MISCONCEPTION",
            "detail": f"{len(lure_fast)} confident wrong answer(s) under 8s: slow down, read the qualifier.",
            "counts": {"fast_lures": len(lure_fast)},
        }
    if slow_gap:
        return {
            "persona": "SCHEMA_DEFICIT",
            "detail": f"{len(slow_gap)} slow, unsure miss(es): build the schema with the worked example first.",
            "counts": {"slow_gaps": len(slow_gap)},
        }
    if items and len(fragile) / len(items) >= 0.3:
        return {
            "persona": "UNCALIBRATED_GUESSER",
            "detail": f"{len(fragile)}/{len(items)} correct-but-unsure: lucky guesses that will decay.",
            "counts": {"fragile": len(fragile)},
        }
    return {"persona": "STEADY", "detail": "No dominant failure pattern.", "counts": {}}


def grade_exam(
    questions: Iterable[Question],
    responses: Iterable[Response],
    topics: Iterable[TopicMeta] = (),
    max_weak_topics: int = 3,
) -> GradedExam:
    questions = list(questions)
    responses = list(responses)
    if not questions:
        raise ValueError("no questions to grade")
    if not responses:
        raise ValueError("no responses to grade")

    by_id = {q.id: q for q in questions}
    answered: set[UUID] = set()
    for response in responses:
        if response.question_id in answered:
            raise ValueError(f"duplicate response for question {response.question_id}")
        if response.question_id not in by_id:
            raise ValueError(f"response for unknown question {response.question_id}")
        answered.add(response.question_id)

    missing = [q.id for q in questions if q.id not in answered]
    if missing:
        raise ValueError(f"missing responses for {len(missing)} question(s): {missing[:3]}")

    items = tuple(grade_item(by_id[r.question_id], r) for r in responses)
    topic_meta = {t.topic_id: t for t in topics}

    per_topic: dict[UUID, list[GradedItem]] = {}
    for item in items:
        per_topic.setdefault(item.topic_id, []).append(item)

    results: list[TopicResult] = []
    for topic_id, topic_items in per_topic.items():
        meta = topic_meta.get(topic_id, TopicMeta(topic_id=topic_id))
        raw_accuracy = _mean([1.0 if i.is_correct else 0.0 for i in topic_items])
        mastery = _mean([i.mastery_credit for i in topic_items])
        trapped = tuple(
            dict.fromkeys(
                i.endorsed_misconception
                for i in topic_items
                if i.diagnostic_state is DiagnosticState.LURE_ENTRAPMENT and i.endorsed_misconception
            )
        )
        results.append(
            TopicResult(
                topic_id=topic_id,
                title=meta.title,
                raw_accuracy=round(raw_accuracy, 4),
                mastery_score=round(mastery, 4),
                vulnerability_score=round(
                    vulnerability(mastery, meta.syllabus_weight, meta.out_degree), 4
                ),
                is_flagged_weak=False,
                trapped_misconceptions=trapped,
            )
        )

    ranked = sorted(results, key=lambda r: r.vulnerability_score, reverse=True)
    weak = {
        r.topic_id
        for r in ranked
        if r.mastery_score < WEAK_MASTERY_THRESHOLD or r.trapped_misconceptions
    }
    weak_order = [r.topic_id for r in ranked if r.topic_id in weak][:max_weak_topics]
    flagged = set(weak_order)
    results = [
        TopicResult(
            topic_id=r.topic_id,
            title=r.title,
            raw_accuracy=r.raw_accuracy,
            mastery_score=r.mastery_score,
            vulnerability_score=r.vulnerability_score,
            is_flagged_weak=r.topic_id in flagged,
            trapped_misconceptions=r.trapped_misconceptions,
        )
        for r in results
    ]

    counts = {state.value: 0 for state in STATE_ORDER}
    for item in items:
        counts[item.diagnostic_state.value] += 1

    return GradedExam(
        raw_accuracy=round(_mean([1.0 if i.is_correct else 0.0 for i in items]), 4),
        mastery_score=round(_mean([i.mastery_credit for i in items]), 4),
        mce_score=round(_mean([abs(i.confidence_level - int(i.is_correct)) for i in items]), 4),
        lure_persistence_rate=round(counts[DiagnosticState.LURE_ENTRAPMENT.value] / len(items), 4),
        state_counts=counts,
        items=items,
        topics=tuple(results),
        weak_topic_ids=tuple(weak_order),
    )


def lure_persistence(parent_tags: Iterable[str], retest_tags: Iterable[str]) -> float:
    """Share of round-1 misconception tags that survive into the retest (PRD: |L n L'| / |L|)."""
    exposed = {tag for tag in parent_tags if tag}
    if not exposed:
        return 0.0
    return round(len(exposed & {tag for tag in retest_tags if tag}) / len(exposed), 4)
