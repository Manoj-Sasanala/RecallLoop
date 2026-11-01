from uuid import uuid4

import pytest

from app.grading import Response, TopicMeta, behavior_persona, grade_exam, lure_persistence, paced_time_limit
from app.models import DiagnosticState, Question

ATTEMPT = uuid4()
DOC = uuid4()
TOPIC_A = uuid4()
TOPIC_B = uuid4()


def question(topic_id=TOPIC_A, correct="A", qid=None):
    return Question(
        id=qid or uuid4(),
        exam_attempt_id=ATTEMPT,
        topic_id=topic_id,
        source_doc_id=DOC,
        question_stem="Which property does Raft guarantee?",
        source_page_number=1,
        verbatim_source_quote="a leader handles all client requests",
        options_json=[
            {
                "option_id": option_id,
                "text": f"option {option_id}",
                "is_correct": option_id == correct,
                "misconception_type": None if option_id == correct else f"lure_{option_id}",
                "rationale": "",
            }
            for option_id in "ABCD"
        ],
        correct_option_id=correct,
    )


def answer(q, option=None, confidence=1):    return Response(
        question_id=q.id,
        selected_option_id=option or q.correct_option_id,
        confidence_level=confidence,
        time_spent_ms=1000,
    )


def test_all_correct_and_confident_is_mastered():
    questions = [question(), question()]
    result = grade_exam(questions, [answer(q) for q in questions])
    assert result.raw_accuracy == 1.0
    assert result.mastery_score == 1.0
    assert result.mce_score == 0.0
    assert result.state_counts == {
        "MASTERED": 2,
        "FRAGILE_GUESS": 0,
        "RECOGNIZED_GAP": 0,
        "LURE_ENTRAPMENT": 0,
    }
    assert result.weak_topic_ids == ()


def test_correct_but_unsure_is_fragile_guess():
    q = question()
    result = grade_exam([q], [answer(q, confidence=0)])
    item = result.items[0]
    assert item.is_correct
    assert item.diagnostic_state is DiagnosticState.FRAGILE_GUESS
    assert result.mastery_score == 0.7
    assert result.mce_score == 1.0
    assert item.penalty_weight == 0.3


def test_wrong_but_unsure_is_recognized_gap():
    q = question(correct="A")
    result = grade_exam([q], [answer(q, "B", confidence=0)])
    item = result.items[0]
    assert not item.is_correct
    assert item.diagnostic_state is DiagnosticState.RECOGNIZED_GAP
    assert item.endorsed_misconception == "lure_B"
    assert item.penalty_weight == 0.5


def test_wrong_and_confident_is_lure_entrapment():
    q = question(correct="A")
    result = grade_exam([q], [answer(q, "C", confidence=1)])
    item = result.items[0]
    assert item.diagnostic_state is DiagnosticState.LURE_ENTRAPMENT
    assert result.lure_persistence_rate == 1.0
    assert result.mce_score == 1.0
    assert item.penalty_weight == 1.0


def test_guessing_lowers_mastery_below_raw_accuracy():
    q1, q2 = question(), question()
    # one confident hit, one lucky guess: raw accuracy 1.0, mastery must be lower
    result = grade_exam([q1, q2], [answer(q1), answer(q2, confidence=0)])
    assert result.raw_accuracy == 1.0
    assert result.mastery_score == 0.85
    assert result.state_counts["FRAGILE_GUESS"] == 1


def test_weak_topic_ranking_flags_lowest_mastery():
    a1, a2 = question(TOPIC_A), question(TOPIC_A)
    b1 = question(TOPIC_B)
    topics = [TopicMeta(TOPIC_A, "Raft"), TopicMeta(TOPIC_B, "Paxos")]
    result = grade_exam(
        [a1, a2, b1],
        [answer(a1), answer(a2), answer(b1, "D", confidence=1)],
        topics,
    )
    ranked = {t.topic_id: t for t in result.topics}
    assert ranked[TOPIC_B].vulnerability_score > ranked[TOPIC_A].vulnerability_score
    assert result.weak_topic_ids == (TOPIC_B,)
    assert ranked[TOPIC_A].is_flagged_weak is False


def test_out_degree_raises_vulnerability():
    q = question()
    weak_meta = TopicMeta(TOPIC_A, "Raft", out_degree=4)
    result = grade_exam([q], [answer(q, "B", confidence=0)], [weak_meta])
    assert result.topics[0].mastery_score == 0.5
    assert result.topics[0].vulnerability_score == 0.5 * (1 + 0.25 * 4)


def test_trapped_misconceptions_are_collected_once():
    q1 = question(correct="A")
    q2 = question(correct="A")
    result = grade_exam(
        [q1, q2],
        [answer(q1, "B", confidence=1), answer(q2, "B", confidence=1)],
    )
    assert result.topics[0].trapped_misconceptions == ("lure_B",)


def test_max_weak_topics_caps_the_flag_list():
    questions = [question(TOPIC_A), question(TOPIC_B), question(TOPIC_A), question(TOPIC_B)]
    responses = [answer(q, "D", confidence=0) for q in questions]
    result = grade_exam(
        questions,
        responses,
        [TopicMeta(TOPIC_A, "A"), TopicMeta(TOPIC_B, "B")],
        max_weak_topics=1,
    )
    assert len(result.weak_topic_ids) == 1


def test_missing_response_is_rejected():
    q1, q2 = question(), question()
    with pytest.raises(ValueError, match="missing responses"):
        grade_exam([q1, q2], [answer(q1)])


def test_duplicate_response_is_rejected():
    q = question()
    with pytest.raises(ValueError, match="duplicate response"):
        grade_exam([q], [answer(q), answer(q)])


def test_response_for_unknown_question_is_rejected():
    q = question()
    ghost = Response(question_id=uuid4(), selected_option_id="A", confidence_level=1)
    with pytest.raises(ValueError, match="unknown question"):
        grade_exam([q], [ghost])


def test_empty_inputs_are_rejected():
    q = question()
    with pytest.raises(ValueError, match="no responses"):
        grade_exam([q], [])
    with pytest.raises(ValueError, match="no questions"):
        grade_exam([], [answer(q)])


def test_invalid_confidence_is_rejected():
    q = question()
    with pytest.raises(ValueError, match="confidence_level"):
        grade_exam([q], [answer(q, confidence=2)])


def test_unknown_option_is_rejected():
    q = question()
    with pytest.raises(ValueError, match="unknown option"):
        grade_exam([q], [answer(q, "Z")])


def test_all_wrong_but_aware_exam_is_flagged_weak():
    q1, q2 = question(), question()
    result = grade_exam([q1, q2], [answer(q1, "B", confidence=0), answer(q2, "B", confidence=0)])
    assert result.raw_accuracy == 0.0
    assert result.mastery_score == 0.5
    assert result.topics[0].vulnerability_score == 0.5
    assert result.weak_topic_ids == (TOPIC_A,)


def test_fragile_guesses_alone_are_not_flagged_weak():
    q = question()
    result = grade_exam([q], [answer(q, confidence=0)])
    assert result.mastery_score == 0.7
    assert result.weak_topic_ids == ()


def test_lure_persistence_counts_tags_that_survive_the_retest():
    assert lure_persistence(["role_confusion", "traffic_misread"], ["traffic_misread"]) == 0.5
    assert lure_persistence(["role_confusion"], ["role_confusion"]) == 1.0
    assert lure_persistence([], ["anything"]) == 0.0


def test_syllabus_weight_scales_vulnerability():
    light, heavy = uuid4(), uuid4()
    q1, q2 = question(light), question(heavy)
    result = grade_exam(
        [q1, q2],
        [answer(q1, "D", confidence=1), answer(q2, "D", confidence=1)],
        [TopicMeta(light, "light", syllabus_weight=0.1), TopicMeta(heavy, "heavy", syllabus_weight=0.9)],
    )
    by_id = {t.topic_id: t for t in result.topics}
    assert by_id[heavy].vulnerability_score == 0.9
    assert by_id[light].vulnerability_score == 0.1
    assert result.weak_topic_ids == (heavy, light)


def test_paced_time_limit_scales_with_words():
    short = paced_time_limit([10] * 6)
    long = paced_time_limit([60] * 6)
    assert short < long
    assert short >= 120
    assert paced_time_limit([10] * 6) == round(60 / 2.5 + 20 * 6)


def test_behavior_persona_flags_fast_lures():
    from app.grading import GradedItem

    item = GradedItem(
        question_id=uuid4(),
        topic_id=TOPIC_A,
        selected_option_id="B",
        correct_option_id="A",
        confidence_level=1,
        is_correct=False,
        diagnostic_state=DiagnosticState.LURE_ENTRAPMENT,
        penalty_weight=1.0,
        endorsed_misconception="client_authority",
        time_spent_ms=3000,
    )
    assert behavior_persona([item], weak_topic_ids={TOPIC_A}, edges=[])["persona"] == "IMPULSIVE_MISCONCEPTION"


def test_behavior_persona_flags_slow_gaps():
    from app.grading import GradedItem

    item = GradedItem(
        question_id=uuid4(),
        topic_id=TOPIC_A,
        selected_option_id="B",
        correct_option_id="A",
        confidence_level=0,
        is_correct=False,
        diagnostic_state=DiagnosticState.RECOGNIZED_GAP,
        penalty_weight=0.5,
        endorsed_misconception=None,
        time_spent_ms=60000,
    )
    assert behavior_persona([item], weak_topic_ids={TOPIC_A}, edges=[])["persona"] == "SCHEMA_DEFICIT"


def test_behavior_persona_flags_prerequisite_cascade():
    from app.grading import GradedItem

    item = GradedItem(
        question_id=uuid4(),
        topic_id=TOPIC_B,
        selected_option_id="B",
        correct_option_id="A",
        confidence_level=1,
        is_correct=False,
        diagnostic_state=DiagnosticState.LURE_ENTRAPMENT,
        penalty_weight=1.0,
        endorsed_misconception="x",
        time_spent_ms=30000,
    )
    out = behavior_persona([item], weak_topic_ids={TOPIC_A, TOPIC_B}, edges=[(TOPIC_A, TOPIC_B)])
    assert out["persona"] == "PREREQUISITE_BOTTLENECK"


def test_behavior_persona_steady_when_clean():
    from app.grading import GradedItem

    item = GradedItem(
        question_id=uuid4(),
        topic_id=TOPIC_A,
        selected_option_id="A",
        correct_option_id="A",
        confidence_level=1,
        is_correct=True,
        diagnostic_state=DiagnosticState.MASTERED,
        penalty_weight=0.0,
        endorsed_misconception=None,
        time_spent_ms=12000,
    )
    assert behavior_persona([item], weak_topic_ids=set(), edges=[])["persona"] == "STEADY"
