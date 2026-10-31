from sqlalchemy.pool import StaticPool
from sqlmodel import Session, create_engine, select

from app.db import init_db
from app.models import (
    DocumentPage,
    ExamAttempt,
    Question,
    SourceDocument,
    StudySession,
    Topic,
)


def test_all_tables_roundtrip_through_sqlite():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    init_db(engine)

    with Session(engine) as db:
        session = StudySession(title="Distributed Systems", course_code="CS-451")
        db.add(session)
        db.commit()

        doc = SourceDocument(
            session_id=session.id,
            filename="raft.pdf",
            doc_role="STUDY_MATERIAL",
            sha256_hash="abc123",
            page_count=1,
            file_size_bytes=1024,
        )
        db.add(doc)
        db.commit()

        db.add(
            DocumentPage(
                document_id=doc.id,
                page_number=1,
                raw_text="A leader handles all client requests.",
                normalized_text="a leader handles all client requests",
                token_count=7,
            )
        )
        topic = Topic(session_id=session.id, code="T1", title="Raft", syllabus_weight=0.35)
        db.add(topic)
        db.commit()

        attempt = ExamAttempt(session_id=session.id, time_limit_sec=600)
        db.add(attempt)
        db.commit()

        db.add(
            Question(
                exam_attempt_id=attempt.id,
                topic_id=topic.id,
                source_doc_id=doc.id,
                question_stem="Who handles client requests in Raft?",
                source_page_number=1,
                verbatim_source_quote="A leader handles all client requests",
                quote_match_ratio=1.0,
                options_json=[
                    {"option_id": "A", "text": "The leader", "is_correct": True},
                    {"option_id": "B", "text": "A follower", "is_correct": False},
                ],
                correct_option_id="A",
            )
        )
        db.commit()

        stored = db.exec(select(Question)).one()
        assert stored.correct_option_id == "A"
        assert stored.options_json[0]["text"] == "The leader"

        loaded_session = db.exec(select(StudySession)).one()
        assert loaded_session.status == "IDLE"
        assert loaded_session.total_tokens_cached == 0
