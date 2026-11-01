"""Session lifecycle: ingestion, exam generation, grading, remediation, delta.

Routes stay thin; everything that touches the database or the model lives here.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlmodel import Session, select

from app.bundles import BUNDLES, BundleQuestion, seed_session
from app.grading import Response as GradedResponse
from app.grading import TopicMeta, behavior_persona, grade_exam, paced_time_limit
from app.ingestion import ExtractedDocument, ExtractedPage, extract_pdf
from app.llm import LLMClient
from app.models import (
    DocumentPage,
    ExamAttempt,
    ExamType,
    Question,
    QuestionAttempt,
    RelationshipType,
    SessionNote,
    SessionPlan,
    SourceDocument,
    StudySession,
    Topic,
    TopicEdge,
    TopicMasterySnapshot,
)
from app.orchestrator import GenerationResult, corpus_prefix, generate_exam
from app.verification import extract_json, find_quote_span, normalize


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_session(db: Session, title: str, demo_bundle_id: str | None = None) -> StudySession:
    if demo_bundle_id:
        bundle = BUNDLES.get(demo_bundle_id)
        if bundle is None:
            raise ValueError(f"unknown demo bundle {demo_bundle_id!r}")
        return seed_session(db, bundle)
    session = StudySession(title=title)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: UUID) -> StudySession:
    session = db.get(StudySession, session_id)
    if session is None:
        raise LookupError("session not found")
    return session


def add_documents(db: Session, session: StudySession, uploads: list[tuple[str, bytes, str]]):
    created = []
    existing = {doc.sha256_hash for doc in db.exec(select(SourceDocument).where(SourceDocument.session_id == session.id))}
    for filename, data, role in uploads:
        extracted = extract_pdf(data, filename)
        if extracted.sha256_hash in existing:
            continue
        document = SourceDocument(
            session_id=session.id,
            filename=filename,
            doc_role=role,
            sha256_hash=extracted.sha256_hash,
            page_count=extracted.page_count,
            file_size_bytes=extracted.file_size_bytes,
        )
        db.add(document)
        db.commit()
        db.refresh(document)
        for page in extracted.pages:
            db.add(
                DocumentPage(
                    document_id=document.id,
                    page_number=page.page_number,
                    raw_text=page.raw_text,
                    normalized_text=page.normalized_text,
                    has_visual_diagram=page.has_visual_diagram,
                    page_image_b64=page.page_image_b64,
                    token_count=page.token_count,
                )
            )
        db.commit()
        existing.add(extracted.sha256_hash)
        created.append(document)
    return created


def build_document(db: Session, session: StudySession) -> ExtractedDocument:
    documents = list(db.exec(select(SourceDocument).where(SourceDocument.session_id == session.id)))
    if not documents:
        raise ValueError("no documents uploaded")
    pages: list[ExtractedPage] = []
    for document in documents:
        rows = db.exec(
            select(DocumentPage)
            .where(DocumentPage.document_id == document.id)
            .order_by(DocumentPage.page_number)
        )
        for row in rows:
            pages.append(
                ExtractedPage(
                    page_number=row.page_number,
                    raw_text=row.raw_text,
                    normalized_text=row.normalized_text,
                    has_visual_diagram=row.has_visual_diagram,
                    page_image_b64=row.page_image_b64,
                    token_count=row.token_count,
                )
            )
    return ExtractedDocument(
        filename=" + ".join(d.filename for d in documents),
        sha256_hash="-".join(d.sha256_hash for d in documents),
        page_count=len(pages),
        file_size_bytes=sum(d.file_size_bytes for d in documents),
        pages=tuple(pages),
        diagram_pages=tuple(p.page_number for p in pages if p.has_visual_diagram),
    )


def topic_map(db: Session, session: StudySession) -> dict[str, Topic]:
    return {topic.code: topic for topic in db.exec(select(Topic).where(Topic.session_id == session.id))}


def _question_rows(
    db: Session,
    attempt: ExamAttempt,
    session: StudySession,
    pool: list[BundleQuestion],
    source_doc_id: UUID,
    topics: dict[str, Topic],
) -> list[Question]:
    rows: list[Question] = []
    for index, spec in enumerate(pool, start=1):
        topic = topics.get(spec.topic_code) or next(iter(topics.values()))
        row = Question(
            exam_attempt_id=attempt.id,
            topic_id=topic.id,
            source_doc_id=source_doc_id,
            display_order=index,
            question_stem=spec.stem,
            cognitive_level=spec.cognitive_level,
            source_page_number=spec.page,
            verbatim_source_quote=spec.quote,
            quote_match_ratio=1.0,
            options_json=list(spec.options),
            correct_option_id=next(o["option_id"] for o in spec.options if o["is_correct"]),
        )
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def generate_for_session(
    db: Session,
    session: StudySession,
    client: LLMClient,
    question_count: int = 12,
    parent: ExamAttempt | None = None,
    topic_codes: list[str] | None = None,
) -> tuple[ExamAttempt, list[Question], GenerationResult | None]:
    topics = topic_map(db, session)
    if not topics:
        raise ValueError("session has no topics; extract a blueprint first")

    attempt = ExamAttempt(
        session_id=session.id,
        parent_attempt_id=parent.id if parent else None,
        round_number=(parent.round_number + 1) if parent else 1,
        exam_type=ExamType.TARGETED_RETEST if parent else ExamType.INITIAL_DIAGNOSTIC,
        time_limit_sec=300 if parent else 600,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    if session.demo_bundle_id:
        bundle = BUNDLES[session.demo_bundle_id]
        pool = list(bundle.retest if parent else bundle.questions)
        if topic_codes:
            wanted = {code for code, topic in topics.items() if topic.id in topic_codes}
            pool = [q for q in pool if q.topic_code in wanted] or pool
        document = db.exec(select(SourceDocument).where(SourceDocument.session_id == session.id)).first()
        rows = _question_rows(db, attempt, session, pool[:question_count], document.id, topics)
        attempt.time_limit_sec = paced_time_limit([_pool_words(q) for q in pool[:question_count]])
        db.add(attempt)
        db.commit()
        session.status = "EXAM_READY"
        db.add(session)
        db.commit()
        return attempt, rows, None

    document = build_document(db, session)
    forbidden = set()
    if parent:
        parent_rows = db.exec(select(Question).where(Question.exam_attempt_id == parent.id))
        forbidden = {normalize(q.question_stem) for q in parent_rows}
    result = generate_exam(
        client,
        document,
        question_count=question_count,
        topic_codes=topic_codes or list(topics),
        forbidden_stems=forbidden,
    )
    rows = []
    source_doc = db.exec(select(SourceDocument).where(SourceDocument.session_id == session.id)).first()
    for index, verified in enumerate(result.report.accepted, start=1):
        topic = topics.get(verified.topic_code or "") or next(iter(topics.values()))
        row = Question(
            exam_attempt_id=attempt.id,
            topic_id=topic.id,
            source_doc_id=source_doc.id,
            display_order=index,
            question_stem=verified.question_stem,
            cognitive_level=verified.cognitive_level,
            source_page_number=verified.source_page_number,
            verbatim_source_quote=verified.verbatim_source_quote,
            quote_match_ratio=verified.quote_match_ratio,
            options_json=list(verified.options),
            correct_option_id=verified.correct_option_id,
            target_misconception_tested=verified.target_misconception_tested,
        )
        db.add(row)
        rows.append(row)
    db.commit()
    for row in rows:
        db.refresh(row)
    attempt.time_limit_sec = paced_time_limit([_question_words(q) for q in rows])
    db.add(attempt)
    db.commit()
    session.status = "EXAM_READY"
    db.add(session)
    db.commit()
    return attempt, rows, result


def simulation_payload(questions: list[Question]) -> list[dict]:
    return [
        {
            "question_id": str(q.id),
            "display_order": q.display_order,
            "question_stem": q.question_stem,
            "cognitive_level": q.cognitive_level,
            "options": [{"option_id": o["option_id"], "text": o["text"]} for o in q.options_json],
        }
        for q in sorted(questions, key=lambda q: q.display_order)
    ]


def grade_submission(
    db: Session,
    attempt: ExamAttempt,
    responses: list[dict],
    time_elapsed_sec: int,
) -> dict:
    if attempt.submitted_at is not None:
        raise RuntimeError("exam already submitted")
    questions = list(db.exec(select(Question).where(Question.exam_attempt_id == attempt.id)))
    if not questions:
        raise LookupError("exam has no questions")

    graded_responses = [
        GradedResponse(
            question_id=UUID(str(item["question_id"])),
            selected_option_id=item["selected_option_id"],
            confidence_level=int(item["confidence_level"]),
            time_spent_ms=int(item.get("time_spent_ms", 0)),
        )
        for item in responses
    ]
    topics = list(db.exec(select(Topic).where(Topic.session_id == attempt.session_id)))
    result = grade_exam(
        questions,
        graded_responses,
        [TopicMeta(t.id, t.title, t.syllabus_weight, t.out_degree) for t in topics],
    )

    for item in result.items:
        db.add(
            QuestionAttempt(
                exam_attempt_id=attempt.id,
                question_id=item.question_id,
                selected_option_id=item.selected_option_id,
                confidence_level=item.confidence_level,
                is_correct=item.is_correct,
                diagnostic_state=item.diagnostic_state,
                penalty_weight=item.penalty_weight,
                endorsed_misconception=item.endorsed_misconception,
                time_spent_ms=item.time_spent_ms,
            )
        )
    for topic in result.topics:
        db.add(
            TopicMasterySnapshot(
                exam_attempt_id=attempt.id,
                topic_id=topic.topic_id,
                raw_accuracy=topic.raw_accuracy,
                mastery_score=topic.mastery_score,
                vulnerability_score=topic.vulnerability_score,
                is_flagged_weak=topic.is_flagged_weak,
                trapped_misconceptions_json=list(topic.trapped_misconceptions),
            )
        )

    attempt.raw_accuracy = result.raw_accuracy
    attempt.mastery_score = result.mastery_score
    attempt.mce_score = result.mce_score
    attempt.lure_persistence_rate = result.lure_persistence_rate
    attempt.time_elapsed_sec = time_elapsed_sec
    attempt.submitted_at = utcnow()
    db.add(attempt)
    db.commit()

    edge_rows = list(
        db.exec(select(TopicEdge).where(TopicEdge.session_id == attempt.session_id))
    )
    behavior = behavior_persona(
        result.items,
        result.weak_topic_ids,
        [(e.prerequisite_topic_id, e.dependent_topic_id) for e in edge_rows],
    )

    by_id = {q.id: q for q in questions}
    graded_items = []
    for item in result.items:
        question = by_id[item.question_id]
        selected = next(o for o in question.options_json if o["option_id"] == item.selected_option_id)
        graded_items.append(
            {
                "question_id": str(question.id),
                "stem": question.question_stem,
                "source_page_number": question.source_page_number,
                "verbatim_source_quote": question.verbatim_source_quote,
                "selected_option_id": item.selected_option_id,
                "selected_option_text": selected["text"],
                "correct_option_id": item.correct_option_id,
                "is_correct": item.is_correct,
                "diagnostic_state": item.diagnostic_state.value,
                "endorsed_misconception": item.endorsed_misconception,
                "rationale": selected.get("rationale", ""),
            }
        )

    return {
        "exam_attempt_id": str(attempt.id),
        "summary": {
            "raw_accuracy": result.raw_accuracy,
            "mastery_score": result.mastery_score,
            "mce_score": result.mce_score,
            "lure_persistence_rate": result.lure_persistence_rate,
            "state_counts": result.state_counts,
            "behavior": behavior,
        },
        "topic_breakdown": [
            {
                "topic_id": str(t.topic_id),
                "title": t.title,
                "raw_accuracy": t.raw_accuracy,
                "mastery_score": t.mastery_score,
                "vulnerability_score": t.vulnerability_score,
                "is_flagged_weak": t.is_flagged_weak,
                "trapped_misconceptions": list(t.trapped_misconceptions),
            }
            for t in sorted(result.topics, key=lambda t: t.vulnerability_score, reverse=True)
        ],
        "graded_items": graded_items,
    }


def weak_topic_ids(db: Session, attempt: ExamAttempt) -> list[UUID]:
    rows = db.exec(
        select(TopicMasterySnapshot).where(
            TopicMasterySnapshot.exam_attempt_id == attempt.id,
            TopicMasterySnapshot.is_flagged_weak == True,  # noqa: E712
        )
    )
    ranked = sorted(rows, key=lambda r: r.vulnerability_score, reverse=True)
    return [row.topic_id for row in ranked]


def list_sessions(db: Session) -> list[dict]:
    sessions = list(db.exec(select(StudySession).order_by(StudySession.created_at.desc())))  # type: ignore[arg-type]
    out = []
    for session in sessions:
        attempts = list(
            db.exec(
                select(ExamAttempt)
                .where(
                    ExamAttempt.session_id == session.id,
                    ExamAttempt.submitted_at.is_not(None),
                )
                .order_by(ExamAttempt.round_number)
            )
        )
        weak_total = 0
        last_mastery = None
        for attempt in attempts:
            snaps = list(
                db.exec(
                    select(TopicMasterySnapshot).where(
                        TopicMasterySnapshot.exam_attempt_id == attempt.id
                    )
                )
            )
            weak_total += sum(1 for s in snaps if s.is_flagged_weak)
            if snaps:
                last_mastery = sum(s.mastery_score for s in snaps) / len(snaps)
        out.append(
            {
                "session_id": str(session.id),
                "title": session.title,
                "course_code": session.course_code,
                "status": session.status,
                "demo_bundle_id": session.demo_bundle_id,
                "created_at": session.created_at.isoformat(),
                "rounds": len(attempts),
                "weak_topics": weak_total,
                "last_mastery": round(last_mastery, 4) if last_mastery is not None else None,
            }
        )
    return out


def get_notes(db: Session, session: StudySession) -> dict:
    note = db.get(SessionNote, session.id)
    return {
        "session_id": str(session.id),
        "notes_md": note.notes_md if note else "",
        "updated_at": note.updated_at.isoformat() if note else None,
    }


def save_notes(db: Session, session: StudySession, notes_md: str) -> dict:
    note = db.get(SessionNote, session.id)
    if note is None:
        note = SessionNote(session_id=session.id, notes_md=notes_md)
    else:
        note.notes_md = notes_md
        note.updated_at = utcnow()
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "session_id": str(session.id),
        "notes_md": note.notes_md,
        "updated_at": note.updated_at.isoformat(),
    }


STAGES = ("HALF_1", "HALF_2", "FULL")


def get_plan(db: Session, session: StudySession) -> dict:
    plan = db.get(SessionPlan, session.id)
    return {
        "session_id": str(session.id),
        "exam_date": plan.exam_date if plan else None,
        "stage": plan.stage if plan else "FULL",
    }


def save_plan(db: Session, session: StudySession, exam_date: str | None, stage: str) -> dict:
    if stage not in STAGES:
        raise ValueError(f"stage must be one of {STAGES}")
    if exam_date is not None and not _valid_date(exam_date):
        raise ValueError("exam_date must be YYYY-MM-DD")
    plan = db.get(SessionPlan, session.id)
    if plan is None:
        plan = SessionPlan(session_id=session.id, exam_date=exam_date, stage=stage)
    else:
        plan.exam_date = exam_date
        plan.stage = stage
        plan.updated_at = utcnow()
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return get_plan(db, session)


def _valid_date(value: str) -> bool:
    from datetime import date as date_cls

    try:
        date_cls.fromisoformat(value)
        return True
    except ValueError:
        return False


def revision_plan(db: Session, session: StudySession) -> dict:
    """Deterministic next-review dates from the latest graded round.

    Rule (documented, no model): any LURE_ENTRAPMENT or weak topic reviews
    tomorrow; fragile-only topics in 3 days; all-mastered in 7 days.
    """
    from datetime import timedelta

    attempts = list(
        db.exec(
            select(ExamAttempt)
            .where(
                ExamAttempt.session_id == session.id,
                ExamAttempt.submitted_at.is_not(None),
            )
            .order_by(ExamAttempt.round_number)
        )
    )
    if not attempts:
        return {"session_id": str(session.id), "items": [], "reason": "no graded rounds yet"}
    latest = attempts[-1]
    snaps = list(
        db.exec(
            select(TopicMasterySnapshot).where(
                TopicMasterySnapshot.exam_attempt_id == latest.id
            )
        )
    )
    base = utcnow().date()
    items = []
    for snap in snaps:
        topic = db.get(Topic, snap.topic_id)
        if snap.is_flagged_weak:
            days, reason = 1, "weak topic: lure or mastery below threshold"
        elif snap.mastery_score < 1.0:
            days, reason = 3, "fragile: correct but not confident"
        else:
            days, reason = 7, "mastered: spaced reinforcement"
        items.append(
            {
                "topic_id": str(snap.topic_id),
                "title": topic.title if topic else "?",
                "mastery_score": snap.mastery_score,
                "is_flagged_weak": snap.is_flagged_weak,
                "review_on": (base + timedelta(days=days)).isoformat(),
                "in_days": days,
                "reason": reason,
            }
        )
    items.sort(key=lambda i: i["review_on"])
    return {"session_id": str(session.id), "items": items}


def _question_words(question: Question) -> int:
    words = len(question.question_stem.split())
    for opt in question.options_json or []:
        words += len(str(opt.get("text", "")).split())
    return words


def _pool_words(spec) -> int:
    words = len(spec.stem.split())
    for opt in spec.options:
        words += len(str(opt.get("text", "")).split())
    return words


def remediation_cards(db: Session, attempt: ExamAttempt, topic_ids: list[UUID]) -> list[dict]:
    session = db.get(StudySession, attempt.session_id)
    bundle = BUNDLES.get(session.demo_bundle_id) if session and session.demo_bundle_id else None
    cards = []
    for topic_id in topic_ids:
        topic = db.get(Topic, topic_id)
        missed = db.exec(
            select(QuestionAttempt, Question)
            .where(QuestionAttempt.exam_attempt_id == attempt.id)
            .where(QuestionAttempt.question_id == Question.id)
            .where(Question.topic_id == topic_id)
            .where(QuestionAttempt.is_correct == False)  # noqa: E712
        ).all()
        trapped = [row for row in missed if row[0].endorsed_misconception]
        chosen = trapped[0] if trapped else (missed[0] if missed else None)
        if chosen is None:
            continue
        item_attempt, question = chosen
        correct = next(o for o in question.options_json if o["option_id"] == question.correct_option_id)
        page_row = db.exec(
            select(DocumentPage)
            .where(
                DocumentPage.document_id == question.source_doc_id,
                DocumentPage.page_number == question.source_page_number,
            )
            .limit(1)
        ).first()
        worked = (
            f"Worked example: apply the rule from page {question.source_page_number} "
            f"to a new case and explain why the other three options fail."
        )
        if bundle:
            example = next(
                (q for q in bundle.retest if q.topic_code == topic.code and q.stem != question.question_stem),
                None,
            )
            if example:
                worked = f"Try this next, without looking back: {example.stem}"
        cards.append(
            {
                "topic_id": str(topic.id),
                "topic_title": topic.title,
                "trapped_misconception": item_attempt.endorsed_misconception,
                "missed_stem": question.question_stem,
                "source_truth_quote": question.verbatim_source_quote,
                "source_page": question.source_page_number,
                "corrective_explanation_md": (
                    f"**{topic.title}** - you picked an option built on "
                    f"`{item_attempt.endorsed_misconception or 'a conceptual gap'}`.\n\n"
                    f"The source says: \"{question.verbatim_source_quote}\"\n\n"
                    f"The correct answer is **{correct['text']}**."
                ),
                "worked_example_md": worked,
                "page_image_b64": page_row.page_image_b64 if page_row else None,
            }
        )
    return cards


def progress_delta(db: Session, session: StudySession) -> dict:
    attempts = list(
        db.exec(
            select(ExamAttempt)
            .where(ExamAttempt.session_id == session.id, ExamAttempt.submitted_at.is_not(None))
            .order_by(ExamAttempt.round_number)
        )
    )
    rounds = [
        {
            "exam_attempt_id": str(a.id),
            "round_number": a.round_number,
            "raw_accuracy": a.raw_accuracy,
            "mastery_score": a.mastery_score,
            "mce_score": a.mce_score,
            "lure_persistence_rate": a.lure_persistence_rate,
        }
        for a in attempts
    ]
    deltas = []
    if len(attempts) >= 2:
        first, last = attempts[0], attempts[-1]
        first_snaps = {s.topic_id: s for s in db.exec(select(TopicMasterySnapshot).where(TopicMasterySnapshot.exam_attempt_id == first.id))}
        last_snaps = {s.topic_id: s for s in db.exec(select(TopicMasterySnapshot).where(TopicMasterySnapshot.exam_attempt_id == last.id))}
        for topic_id, start in first_snaps.items():
            end = last_snaps.get(topic_id)
            if end is None:
                continue
            deltas.append(
                {
                    "topic_id": str(topic_id),
                    "title": db.get(Topic, topic_id).title,
                    "initial_accuracy": start.raw_accuracy,
                    "retest_accuracy": end.raw_accuracy,
                    "initial_mastery": start.mastery_score,
                    "retest_mastery": end.mastery_score,
                    "delta_mastery": round(end.mastery_score - start.mastery_score, 4),
                }
            )
    return {
        "session_id": str(session.id),
        "rounds": rounds,
        "topic_deltas": deltas,
        "overall_mce_delta": round(
            (attempts[-1].mce_score or 0) - (attempts[0].mce_score or 0), 4
        ) if len(attempts) >= 2 else 0.0,
        "lure_resolution_rate": round(
            1 - (attempts[-1].lure_persistence_rate or 0), 4
        ) if len(attempts) >= 2 else 0.0,
    }


def page_payload(db: Session, document_id: UUID, page_number: int, highlight: str | None = None) -> dict:
    document = db.get(SourceDocument, document_id)
    if document is None:
        raise LookupError("document not found")
    row = db.exec(
        select(DocumentPage).where(
            DocumentPage.document_id == document_id,
            DocumentPage.page_number == page_number,
        )
    ).first()
    if row is None:
        raise LookupError("page out of bounds")
    span = find_quote_span(highlight, row.raw_text) if highlight else None
    return {
        "doc_id": str(document.id),
        "page_number": row.page_number,
        "raw_text": row.raw_text,
        "highlight_char_spans": [span] if span else [],
        "page_image_b64": row.page_image_b64,
    }


BLUEPRINT_PROMPT = """You map a course document into exam topics.

Return JSON only:
{"topics": [{"code": "T1", "title": "...", "weight": 0.35, "start_page": 1, "end_page": 4, "prerequisites": ["T0"]}]}

Rules:
- 3 to 6 topics, weights sum to 1.0 and reflect likely exam emphasis.
- start_page and end_page must be real pages in the document.
- prerequisites may be empty; use codes from this same list.
"""


def extract_blueprint(db: Session, session: StudySession, client: LLMClient, target_question_count: int = 12) -> list[Topic]:
    existing = list(db.exec(select(Topic).where(Topic.session_id == session.id)))
    if existing:
        return existing

    document = build_document(db, session)
    prefix = corpus_prefix(document, include_images=getattr(client, "vision", False))
    messages = [
        {"role": "developer", "content": BLUEPRINT_PROMPT},
        {
            "role": "user",
            "content": f"{prefix}\n\n<TASK>Build the topic blueprint for {target_question_count} questions.</TASK>",
        },
    ]

    specs: list[dict] = []
    try:
        reply = client.complete(messages, effort="medium")
        payload = extract_json(reply.text)
        raw_topics = payload.get("topics", []) if isinstance(payload, dict) else payload
        specs = [item for item in raw_topics if isinstance(item, dict) and item.get("title")]
    except (ValueError, KeyError, TypeError, AttributeError):
        specs = []

    if not specs:
        specs = [
            {
                "code": "T1",
                "title": document.filename,
                "weight": 1.0,
                "start_page": 1,
                "end_page": document.page_count,
                "prerequisites": [],
            }
        ]

    total = sum(float(spec.get("weight", 0) or 0) for spec in specs) or 1.0
    source_doc = db.exec(select(SourceDocument).where(SourceDocument.session_id == session.id)).first()
    created: dict[str, Topic] = {}
    for index, spec in enumerate(specs, start=1):
        code = str(spec.get("code") or f"T{index}")
        start = max(1, min(int(spec.get("start_page", 1) or 1), document.page_count))
        end = max(start, min(int(spec.get("end_page", document.page_count) or document.page_count), document.page_count))
        topic = Topic(
            session_id=session.id,
            code=code,
            title=str(spec["title"])[:200],
            description="",
            syllabus_weight=round(float(spec.get("weight", 0) or 0) / total, 4),
            source_page_refs=[{"doc_id": str(source_doc.id), "start_page": start, "end_page": end}],
            out_degree=0,
        )
        db.add(topic)
        created[code] = topic
    db.commit()
    for topic in created.values():
        db.refresh(topic)

    for spec in specs:
        dependent = created.get(str(spec.get("code") or ""))
        for prerequisite_code in spec.get("prerequisites") or []:
            prerequisite = created.get(str(prerequisite_code))
            if dependent and prerequisite and prerequisite.id != dependent.id:
                db.add(
                    TopicEdge(
                        session_id=session.id,
                        prerequisite_topic_id=prerequisite.id,
                        dependent_topic_id=dependent.id,
                        relationship_type=RelationshipType.PREREQUISITE,
                        rationale="Declared by the syllabus blueprint.",
                    )
                )
                prerequisite.out_degree += 1
                db.add(prerequisite)
    session.status = "BLUEPRINT_READY"
    db.add(session)
    db.commit()
    return list(created.values())
