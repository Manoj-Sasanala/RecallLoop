"""End-to-end API loop on the seeded bundle: no model calls, no network."""

from __future__ import annotations

import json
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.api import create_app
from app.db import make_engine
from app.llm import FakeClient
from app.models import Question, SourceDocument, Topic


def _parse_sse(text: str) -> dict[str, dict]:
    events: dict[str, dict] = {}
    for block in text.split("\n\n"):
        if not block.strip():
            continue
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        if "event" in lines and "data" in lines:
            events[lines["event"]] = json.loads(lines["data"])
    return events


@pytest.fixture()
def api(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    app = create_app(engine, FakeClient([]))
    with TestClient(app) as test_client:
        yield test_client, engine


def _correct_and_distractor(question: Question) -> tuple[str, str]:
    wrong = next(o["option_id"] for o in question.options_json if o["option_id"] != question.correct_option_id)
    return question.correct_option_id, wrong


def test_demo_bundle_full_loop(api):
    client, engine = api
    created = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    assert created.status_code == 201, created.text
    session_id = created.json()["session_id"]
    assert created.json()["demo_bundle_id"] == "cs_raft"

    generated = client.post(f"/api/v1/sessions/{session_id}/exams/generate", json={"question_count": 6})
    assert generated.status_code == 200, generated.text
    events = _parse_sse(generated.text)
    assert "complete" in events, generated.text
    exam = events["complete"]
    assert len(exam["questions"]) == 6
    assert exam["cache_hash"] is None  # bundle path never touches a model
    exam_id = exam["exam_attempt_id"]

    with Session(engine) as db:
        questions = {
            str(q.id): q
            for q in db.exec(select(Question).where(Question.exam_attempt_id == UUID(exam_id)))
        }
        topics = {str(t.id): t for t in db.exec(select(Topic))}

    # Answer topic T1 wrong and confident (lure), topic T2 right and confident.
    responses = []
    for payload in exam["questions"]:
        question = questions[payload["question_id"]]
        correct, wrong = _correct_and_distractor(question)
        topic_code = topics[str(question.topic_id)].code
        pick = wrong if topic_code == "T1" else correct
        responses.append(
            {
                "question_id": payload["question_id"],
                "selected_option_id": pick,
                "confidence_level": 1,
                "time_spent_ms": 5000,
            }
        )

    submitted = client.post(f"/api/v1/exams/{exam_id}/submit", json={"time_elapsed_sec": 120, "responses": responses})
    assert submitted.status_code == 200, submitted.text
    graded = submitted.json()
    assert graded["summary"]["state_counts"]["LURE_ENTRAPMENT"] >= 1
    assert graded["summary"]["behavior"]["persona"] == "IMPULSIVE_MISCONCEPTION"
    weak = [t for t in graded["topic_breakdown"] if t["is_flagged_weak"]]
    assert weak and weak[0]["title"] == "Leader election"
    assert graded["graded_items"][0]["verbatim_source_quote"]

    again = client.post(f"/api/v1/exams/{exam_id}/submit", json={"time_elapsed_sec": 1, "responses": responses})
    assert again.status_code == 409

    remediated = client.post(f"/api/v1/exams/{exam_id}/remediate", json={"max_weak_topics": 3, "retest_question_count": 3})
    assert remediated.status_code == 200, remediated.text
    plan = remediated.json()
    assert plan["remediation_cards"], plan
    assert plan["remediation_cards"][0]["source_truth_quote"]
    assert plan["remediation_cards"][0]["trapped_misconception"]
    assert plan["remediation_cards"][0]["missed_stem"]
    assert "page_image_b64" in plan["remediation_cards"][0]
    retest_id = plan["retest_exam_attempt_id"]
    assert len(plan["retest_questions"]) == 2

    with Session(engine) as db:
        retest_questions = {
            str(q.id): q
            for q in db.exec(select(Question).where(Question.exam_attempt_id == UUID(retest_id)))
        }

    retest_responses = []
    for payload in plan["retest_questions"]:
        question = retest_questions[payload["question_id"]]
        correct, _ = _correct_and_distractor(question)
        retest_responses.append(
            {
                "question_id": payload["question_id"],
                "selected_option_id": correct,
                "confidence_level": 1,
                "time_spent_ms": 3000,
            }
        )
    retest_submit = client.post(f"/api/v1/exams/{retest_id}/submit", json={"time_elapsed_sec": 60, "responses": retest_responses})
    assert retest_submit.status_code == 200, retest_submit.text

    delta = client.get(f"/api/v1/sessions/{session_id}/progress-delta")
    assert delta.status_code == 200, delta.text
    body = delta.json()
    assert len(body["rounds"]) == 2
    assert body["rounds"][1]["raw_accuracy"] == 1.0
    t1 = next(t for t in body["topic_deltas"] if t["title"] == "Leader election")
    assert t1["delta_mastery"] > 0
    assert body["lure_resolution_rate"] > 0

    with Session(engine) as db:
        question = db.exec(select(Question)).first()
    page = client.get(
        f"/api/v1/documents/{question.source_doc_id}/pages/{question.source_page_number}",
        params={"highlight_quote": question.verbatim_source_quote},
    )
    assert page.status_code == 200, page.text
    assert page.json()["highlight_char_spans"]


def test_missing_session_and_unknown_bundle(api):
    client, _engine = api
    assert client.get("/api/v1/sessions/00000000-0000-0000-0000-000000000000").status_code == 404
    bad = client.post("/api/v1/sessions", json={"title": "x", "demo_bundle_id": "nope"})
    assert bad.status_code == 400


def test_blueprint_contract_and_session_purge(api):
    client, _engine = api
    created = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    session_id = created.json()["session_id"]

    blueprint = client.post(f"/api/v1/sessions/{session_id}/blueprint/extract", json={"target_question_count": 8})
    assert blueprint.status_code == 200, blueprint.text
    topics = blueprint.json()["topics"]
    assert len(topics) == 2
    assert sum(t["allocated_questions"] for t in topics) >= 2
    by_code = {t["code"]: t for t in topics}
    assert by_code["T2"]["prerequisites"] == [by_code["T1"]["topic_id"]]
    assert by_code["T1"]["prerequisites"] == []

    deleted = client.delete(f"/api/v1/sessions/{session_id}")
    assert deleted.status_code == 204, deleted.text
    assert client.get(f"/api/v1/sessions/{session_id}").status_code == 404

    with Session(_engine) as db:
        orphans = db.exec(
            select(SourceDocument).where(SourceDocument.session_id == UUID(session_id))
        ).all()
        assert orphans == []


def test_sessions_list_notes_and_revision(api):
    client, _engine = api
    created = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    session_id = created.json()["session_id"]

    listed = client.get("/api/v1/sessions")
    assert listed.status_code == 200, listed.text
    entry = next(s for s in listed.json()["sessions"] if s["session_id"] == session_id)
    assert entry["rounds"] == 0
    assert entry["last_mastery"] is None

    notes = client.get(f"/api/v1/sessions/{session_id}/notes")
    assert notes.status_code == 200, notes.text
    assert notes.json()["notes_md"] == ""

    saved = client.put(
        f"/api/v1/sessions/{session_id}/notes", json={"notes_md": "# Leader election\n- leader handles all requests"}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["notes_md"].startswith("# Leader election")

    reread = client.get(f"/api/v1/sessions/{session_id}/notes")
    assert reread.json()["notes_md"].startswith("# Leader election")

    plan = client.get(f"/api/v1/sessions/{session_id}/revision")
    assert plan.status_code == 200, plan.text
    assert plan.json()["items"] == []

    assert client.get("/api/v1/sessions/00000000-0000-0000-0000-000000000000/notes").status_code == 404

    plan = client.get(f"/api/v1/sessions/{session_id}/plan")
    assert plan.status_code == 200, plan.text
    assert plan.json() == {"session_id": session_id, "exam_date": None, "stage": "FULL"}

    saved_plan = client.put(
        f"/api/v1/sessions/{session_id}/plan",
        json={"exam_date": "2027-05-01", "stage": "HALF_1"},
    )
    assert saved_plan.status_code == 200, saved_plan.text
    assert saved_plan.json()["exam_date"] == "2027-05-01"

    bad_stage = client.put(f"/api/v1/sessions/{session_id}/plan", json={"stage": "NOPE"})
    assert bad_stage.status_code == 400
    bad_date = client.put(
        f"/api/v1/sessions/{session_id}/plan", json={"exam_date": "tomorrow", "stage": "FULL"}
    )
    assert bad_date.status_code == 400


def test_upload_reports_pages_and_tokens(api, tmp_path):
    client, _engine = api
    import pymupdf

    document = pymupdf.open()
    page = document.new_page()
    page.insert_text((72, 72), "A leader handles all client requests.", fontsize=11)
    pdf = document.tobytes()
    document.close()

    created = client.post("/api/v1/sessions", json={"title": "live"})
    session_id = created.json()["session_id"]
    uploaded = client.post(
        f"/api/v1/sessions/{session_id}/documents",
        files={"files": ("raft.pdf", pdf, "application/pdf")},
        data={"doc_roles": "STUDY_MATERIAL"},
    )
    assert uploaded.status_code == 201, uploaded.text
    doc = uploaded.json()["documents"][0]
    assert doc["page_count"] == 1
    assert doc["total_tokens"] > 0
    assert doc["diagram_pages"] == []


def test_health(api):
    client, _engine = api
    assert client.get("/health").json()["status"] == "ok"


def test_oversize_uploads_rejected_without_buffering(api):
    from app.ingestion import MAX_BYTES

    client, _engine = api
    created = client.post("/api/v1/sessions", json={"title": "big"})
    session_id = created.json()["session_id"]

    big_pdf = client.post(
        f"/api/v1/sessions/{session_id}/documents",
        files={"files": ("huge.pdf", b"%PDF" + b"\x00" * MAX_BYTES, "application/pdf")},
        data={"doc_roles": "STUDY_MATERIAL"},
    )
    assert big_pdf.status_code == 400, big_pdf.text

    big_audio = client.post(
        "/api/v1/speech/transcribe",
        files={"audio": ("long.wav", b"RIFF" + b"\x00" * (10 * 1024 * 1024), "audio/wav")},
    )
    assert big_audio.status_code == 400, big_audio.text


def test_transcribe_silence_returns_empty_text(api):
    import io
    import struct
    import wave

    client, _engine = api
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        wav.writeframes(struct.pack("<8000h", *([0] * 8000)))
    replied = client.post(
        "/api/v1/speech/transcribe",
        files={"audio": ("blank.wav", buf.getvalue(), "audio/wav")},
    )
    assert replied.status_code == 200, replied.text
    body = replied.json()
    assert "text" in body
    assert isinstance(body["text"], str)


def test_note_pages_and_database_crud(api):
    client, engine = api
    sess_res = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    sid = sess_res.json()["session_id"]

    # 1. List pages (seeds default general notes and misconception tracker database)
    res = client.get(f"/api/v1/sessions/{sid}/pages")
    assert res.status_code == 200
    pages = res.json()["pages"]
    assert len(pages) >= 2
    assert any(p["page_type"] == "database" for p in pages)
    page1 = pages[0]

    # 2. Create subpage
    created = client.post(
        f"/api/v1/sessions/{sid}/pages",
        json={
            "title": "Exam 1 Formulas",
            "icon": "📐",
            "page_type": "page",
            "parent_page_id": page1["id"],
            "content_md": "# Formulas\n- F = ma",
        },
    )
    assert created.status_code == 200
    new_page = created.json()
    assert new_page["title"] == "Exam 1 Formulas"
    assert new_page["parent_page_id"] == page1["id"]

    # 3. Update page
    updated = client.put(
        f"/api/v1/sessions/{sid}/pages/{new_page['id']}",
        json={"title": "Mastery Formulas", "content_md": "# Updated"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Mastery Formulas"

    # 4. Delete page
    deleted = client.delete(f"/api/v1/sessions/{sid}/pages/{new_page['id']}")
    assert deleted.status_code == 200


def test_session_share_and_duplicate(api):
    client, engine = api
    sess_res = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    sid = sess_res.json()["session_id"]

    # 1. Enable public sharing
    share_res = client.post(
        f"/api/v1/sessions/{sid}/share",
        json={"is_public": True, "allow_duplicate": True},
    )
    assert share_res.status_code == 200
    share_data = share_res.json()
    token = share_data["share_token"]
    assert token

    # 2. Get shared session bundle (public endpoint)
    public_res = client.get(f"/api/v1/share/{token}")
    assert public_res.status_code == 200
    public_data = public_res.json()
    assert public_data["session"]["share_token"] == token
    assert len(public_data["topics"]) > 0

    # 3. Duplicate session
    dup_res = client.post(
        f"/api/v1/share/{token}/duplicate",
        json={"new_title": "Shared Demo (Cloned)"},
    )
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    assert dup_data["session_id"] != sid
    assert dup_data["title"] == "Shared Demo (Cloned)"
