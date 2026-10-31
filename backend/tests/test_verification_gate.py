import json

from app.verification import (
    MIN_QUOTE_MATCH,
    find_quote_span,
    normalize,
    parse_and_verify,
    quote_match_ratio,
    verify_question,
)

PAGE_1 = (
    "Raft is a consensus algorithm in which a leader handles all client requests "
    "and replicates log entries to follower nodes."
)
PAGE_2 = (
    "Raft is a consensus algorithm in which a leader deals all client requests "
    "and replicates log entries to follower nodes."
)
GOOD_QUOTE = "a leader handles all client requests"
PAGES = {1: PAGE_1, 2: PAGE_2}


def make_item(**overrides):
    item = {
        "question_stem": "Which property does the leader provide in Raft?",
        "cognitive_level": "APPLICATION",
        "source_page_number": 1,
        "verbatim_source_quote": GOOD_QUOTE,
        "options": [
            {
                "option_id": "A",
                "text": "It handles all client requests",
                "is_correct": True,
                "misconception_type": None,
                "rationale": "Matches the source.",
            },
            {
                "option_id": "B",
                "text": "It only stores follower logs",
                "is_correct": False,
                "misconception_type": "role_confusion",
                "rationale": "Followers store logs.",
            },
            {
                "option_id": "C",
                "text": "It never contacts followers",
                "is_correct": False,
                "misconception_type": "replication_omission",
                "rationale": "It replicates.",
            },
            {
                "option_id": "D",
                "text": "It ignores client traffic",
                "is_correct": False,
                "misconception_type": "traffic_misread",
                "rationale": "It serves clients.",
            },
        ],
    }
    item.update(overrides)
    return item


def test_normalize_ignores_case_and_punctuation():
    assert normalize("A  Leader, handles ALL client requests!") == normalize(GOOD_QUOTE)


def test_exact_quote_scores_one():
    assert quote_match_ratio(GOOD_QUOTE, PAGE_1) == 1.0


def test_quote_with_different_case_and_spacing_passes():
    verdict = verify_question(
        make_item(verbatim_source_quote="A   LEADER handles all client requests"), PAGES
    )
    assert verdict.ok, verdict.reasons


def test_quote_missing_from_the_cited_page_and_neighbours_is_rejected():
    verdict = verify_question(
        make_item(
            source_page_number=2,
            verbatim_source_quote="Raft was invented by Leslie Lamport in 1989",
        ),
        PAGES,
    )
    assert not verdict.ok
    assert any("not grounded" in reason for reason in verdict.reasons)


def test_paraphrased_quote_is_rejected():
    verdict = verify_question(
        make_item(verbatim_source_quote="the leader processes every request from clients"), PAGES
    )
    assert not verdict.ok
    assert quote_match_ratio("the leader processes every request from clients", PAGE_1) < MIN_QUOTE_MATCH


def test_quote_spanning_a_page_break_passes():
    pages = {
        1: "Raft is a consensus algorithm in which a leader handles all client requests",
        2: "and replicates log entries to follower nodes before acknowledging the client.",
    }
    item = make_item(
        source_page_number=1,
        verbatim_source_quote="all client requests and replicates log entries",
    )
    verdict = verify_question(item, pages)
    assert verdict.ok, verdict.reasons


def test_page_outside_topic_range_is_rejected():
    verdict = verify_question(make_item(), PAGES, allowed_pages={7})
    assert not verdict.ok
    assert any("outside the topic" in reason for reason in verdict.reasons)


def test_repeated_round_one_stem_is_rejected():
    verdict = verify_question(make_item(), PAGES, forbidden_stems={normalize(make_item()["question_stem"])})
    assert not verdict.ok
    assert any("repeats a previous round" in reason for reason in verdict.reasons)


def test_three_options_are_rejected():
    item = make_item()
    item["options"] = item["options"][:3]
    verdict = verify_question(item, PAGES)
    assert not verdict.ok
    assert any("expected 4 options" in reason for reason in verdict.reasons)


def test_duplicate_option_ids_are_rejected():
    item = make_item()
    item["options"][3]["option_id"] = "A"
    verdict = verify_question(item, PAGES)
    assert not verdict.ok
    assert any("unique" in reason for reason in verdict.reasons)


def test_two_correct_options_are_rejected():
    item = make_item()
    item["options"][1]["is_correct"] = True
    item["options"][1]["misconception_type"] = None
    verdict = verify_question(item, PAGES)
    assert not verdict.ok
    assert any("exactly 1 correct" in reason for reason in verdict.reasons)


def test_distractor_without_misconception_type_is_rejected():
    item = make_item()
    item["options"][2]["misconception_type"] = None
    verdict = verify_question(item, PAGES)
    assert not verdict.ok
    assert any("misconception_type" in reason for reason in verdict.reasons)


def test_conspicuously_long_correct_option_is_rejected():
    item = make_item()
    item["options"][0]["text"] = (
        "It accepts every client request and then replicates all log entries to followers, "
        "which is precisely what the leader does in Raft"
    )
    verdict = verify_question(item, PAGES)
    assert not verdict.ok
    assert any("length gives the answer away" in reason for reason in verdict.reasons)


def test_unknown_page_is_rejected():
    verdict = verify_question(make_item(source_page_number=99), PAGES)
    assert not verdict.ok
    assert any("not found" in reason for reason in verdict.reasons)


def test_invalid_cognitive_level_is_rejected():
    verdict = verify_question(make_item(cognitive_level="SYNTHESIS"), PAGES)
    assert not verdict.ok
    assert any("cognitive_level" in reason for reason in verdict.reasons)


def test_short_stem_is_rejected():
    verdict = verify_question(make_item(question_stem="What?"), PAGES)
    assert not verdict.ok
    assert any("question_stem" in reason for reason in verdict.reasons)


def test_fenced_json_is_parsed():
    raw = "```json\n" + json.dumps([make_item()]) + "\n```"
    report = parse_and_verify(raw, PAGES)
    assert len(report.accepted) == 1
    assert report.accepted[0].quote_match_ratio == 1.0
    assert report.accepted[0].correct_option_id == "A"


def test_prose_wrapped_and_object_payload_is_parsed():
    raw = "Here is your exam:\n" + json.dumps({"questions": [make_item()]}) + "\nGood luck!"
    report = parse_and_verify(raw, PAGES)
    assert len(report.accepted) == 1


def test_unparseable_output_is_rejected():
    report = parse_and_verify("I could not produce a JSON exam, sorry.", PAGES)
    assert report.all_rejected
    assert "unparseable" in report.rejected[0][1][0]


def test_one_bad_item_does_not_kill_the_batch():
    bad = make_item(verbatim_source_quote="Raft was invented by Leslie Lamport in 1989")
    raw = json.dumps([make_item(), bad, make_item()])
    report = parse_and_verify(raw, PAGES)
    assert len(report.accepted) == 2
    assert len(report.rejected) == 1


def test_expected_count_shortfall_is_reported_but_keeps_verified_items():
    report = parse_and_verify(json.dumps([make_item()]), PAGES, expected_count=3)
    assert len(report.accepted) == 1
    assert any("only 1/3" in reason for reason in report.rejected[-1][1])


def test_quote_span_locates_the_passage():
    span = find_quote_span(GOOD_QUOTE, PAGE_1)
    assert span is not None
    start, end = span
    assert 0 < start < end <= len(PAGE_1)
    assert "leader handles all client requests" in PAGE_1[start:end].lower()


def test_quote_span_returns_none_when_absent():
    assert find_quote_span("an entirely unrelated sentence here", PAGE_1) is None
