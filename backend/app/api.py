"""FastAPI surface: 8 endpoints under /api/v1 plus health.

create_app(engine, client) is injectable so tests run against in-memory SQLite
and a FakeClient without touching the network.
"""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import Depends, FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session as DBSession
from sqlmodel import select

from app import service
from app.db import init_db, make_engine
from app.llm import client_from_env
from app.models import DocumentPage, ExamAttempt, SourceDocument, StudySession, Topic, TopicEdge


class SessionCreate(BaseModel):
    title: str = "Untitled session"
    demo_bundle_id: str | None = None


class ResponseItem(BaseModel):
    question_id: str
    selected_option_id: str
    confidence_level: int = Field(ge=0, le=1)
    time_spent_ms: int = 0


class SubmitRequest(BaseModel):
    time_elapsed_sec: int = 0
    responses: list[ResponseItem]


class GenerateRequest(BaseModel):
    question_count: int = 12
    time_limit_sec: int = 600


class BlueprintRequest(BaseModel):
    target_question_count: int = 12


class RemediateRequest(BaseModel):
    max_weak_topics: int = 3
    retest_question_count: int = 5


class NotesRequest(BaseModel):
    notes_md: str = ""


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _session_out(session: StudySession) -> dict:
    return {
        "session_id": str(session.id),
        "title": session.title,
        "course_code": session.course_code,
        "status": session.status,
        "demo_bundle_id": session.demo_bundle_id,
        "created_at": session.created_at.isoformat(),
    }


def create_app(engine=None, client=None) -> FastAPI:
    engine = engine or make_engine()
    init_db(engine)

    app = FastAPI(title="RecallLoop", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.engine = engine
    app.state.client = client

    def get_client():
        if app.state.client is None:
            app.state.client = client_from_env()
        return app.state.client

    def db_dep():
        with DBSession(engine) as db:
            yield db

    @app.exception_handler(LookupError)
    def _not_found(_request, exc: LookupError):
        return JSONResponse(status_code=404, content={"detail": str(exc) or "not found"})

    @app.exception_handler(ValueError)
    def _bad_request(_request, exc: ValueError):
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(RuntimeError)
    def _conflict(_request, exc: RuntimeError):
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/v1/sessions", status_code=201)
    def create_session(body: SessionCreate, db: DBSession = Depends(db_dep)):
        return _session_out(service.create_session(db, body.title, body.demo_bundle_id))

    @app.get("/api/v1/sessions")
    def list_all_sessions(db: DBSession = Depends(db_dep)):
        return {"sessions": service.list_sessions(db)}

    @app.get("/api/v1/sessions/{session_id}")
    def read_session(session_id: UUID, db: DBSession = Depends(db_dep)):
        return _session_out(service.get_session(db, session_id))

    @app.get("/api/v1/sessions/{session_id}/notes")
    def read_notes(session_id: UUID, db: DBSession = Depends(db_dep)):
        return service.get_notes(db, service.get_session(db, session_id))

    @app.put("/api/v1/sessions/{session_id}/notes")
    def write_notes(session_id: UUID, body: NotesRequest, db: DBSession = Depends(db_dep)):
        return service.save_notes(db, service.get_session(db, session_id), body.notes_md)

    @app.get("/api/v1/sessions/{session_id}/revision")
    def revision(session_id: UUID, db: DBSession = Depends(db_dep)):
        return service.revision_plan(db, service.get_session(db, session_id))

    @app.post("/api/v1/sessions/{session_id}/documents", status_code=201)
    async def upload_documents(
        session_id: UUID,
        files: list[UploadFile] = File(...),
        doc_roles: list[str] = Form(...),
        db: DBSession = Depends(db_dep),
    ):
        session = service.get_session(db, session_id)
        if len(files) != len(doc_roles):
            raise ValueError("one doc_role per file is required")
        uploads = [(upload.filename or "document.pdf", await upload.read(), role) for upload, role in zip(files, doc_roles)]
        documents = service.add_documents(db, session, uploads)
        payload = []
        for document in documents:
            pages = list(db.exec(select(DocumentPage).where(DocumentPage.document_id == document.id)))
            payload.append(
                {
                    "doc_id": str(document.id),
                    "filename": document.filename,
                    "doc_role": document.doc_role,
                    "page_count": document.page_count,
                    "diagram_pages": [p.page_number for p in pages if p.has_visual_diagram],
                    "total_tokens": sum(p.token_count for p in pages),
                }
            )
        return {"session_id": str(session.id), "documents": payload}

    @app.post("/api/v1/sessions/{session_id}/blueprint/extract")
    def extract_blueprint(
        session_id: UUID, body: BlueprintRequest, db: DBSession = Depends(db_dep)
    ):
        session = service.get_session(db, session_id)
        topics = service.extract_blueprint(db, session, get_client(), body.target_question_count)
        prereqs: dict[str, list[str]] = {}
        for edge in db.exec(select(TopicEdge).where(TopicEdge.session_id == session.id)):
            dependent = db.get(Topic, edge.dependent_topic_id)
            prerequisite = db.get(Topic, edge.prerequisite_topic_id)
            if dependent and prerequisite:
                prereqs.setdefault(str(dependent.id), []).append(str(prerequisite.id))
        total_weight = sum(t.syllabus_weight for t in topics) or 1.0
        return {
            "session_id": str(session.id),
            "status": "BLUEPRINT_READY",
            "topics": [
                {
                    "topic_id": str(topic.id),
                    "code": topic.code,
                    "title": topic.title,
                    "syllabus_weight": topic.syllabus_weight,
                    "allocated_questions": max(
                        1, round(topic.syllabus_weight / total_weight * body.target_question_count)
                    ),
                    "out_degree": topic.out_degree,
                    "page_refs": topic.source_page_refs,
                    "prerequisites": prereqs.get(str(topic.id), []),
                }
                for topic in topics
            ],
        }

    @app.post("/api/v1/sessions/{session_id}/exams/generate")
    def generate_exam(session_id: UUID, body: GenerateRequest, db: DBSession = Depends(db_dep)):
        session = service.get_session(db, session_id)

        def events():
            try:
                yield _sse("progress", {"step": "GENERATING", "verified_count": 0})
                attempt, questions, result = service.generate_for_session(
                    db, session, get_client(), body.question_count
                )
                verified = len(questions)
                yield _sse("progress", {"step": "VERIFYING_QUOTES", "verified_count": verified})
                if result and result.repairs:
                    yield _sse("progress", {"step": "REPAIRING", "verified_count": verified})
                yield _sse(
                    "complete",
                    {
                        "exam_attempt_id": str(attempt.id),
                        "time_limit_sec": attempt.time_limit_sec,
                        "questions": service.simulation_payload(questions),
                        "cache_hash": result.cache_hash if result else None,
                        "cache_hit_tokens": result.cache_hit_tokens if result else 0,
                        "repairs": result.repairs if result else 0,
                    },
                )
            except Exception as exc:  # streaming errors cannot become HTTP status codes
                yield _sse("error", {"detail": str(exc)})

        return StreamingResponse(events(), media_type="text/event-stream")

    @app.post("/api/v1/exams/{exam_id}/submit")
    def submit_exam(exam_id: UUID, body: SubmitRequest, db: DBSession = Depends(db_dep)):
        attempt = db.get(ExamAttempt, exam_id)
        if attempt is None:
            raise LookupError("exam not found")
        return service.grade_submission(
            db, attempt, [item.model_dump() for item in body.responses], body.time_elapsed_sec
        )

    @app.post("/api/v1/exams/{exam_id}/remediate")
    def remediate(exam_id: UUID, body: RemediateRequest, db: DBSession = Depends(db_dep)):
        attempt = db.get(ExamAttempt, exam_id)
        if attempt is None:
            raise LookupError("exam not found")
        weak = service.weak_topic_ids(db, attempt)[: body.max_weak_topics]
        if not weak:
            raise ValueError("no weak topics flagged on this exam")
        cards = service.remediation_cards(db, attempt, weak)
        session = service.get_session(db, attempt.session_id)
        retest, questions, _ = service.generate_for_session(
            db,
            session,
            get_client(),
            question_count=body.retest_question_count,
            parent=attempt,
            topic_codes=weak,
        )
        return {
            "parent_attempt_id": str(attempt.id),
            "remediation_cards": cards,
            "retest_exam_attempt_id": str(retest.id),
            "retest_questions": service.simulation_payload(questions),
        }

    @app.get("/api/v1/sessions/{session_id}/progress-delta")
    def progress_delta(session_id: UUID, db: DBSession = Depends(db_dep)):
        return service.progress_delta(db, service.get_session(db, session_id))

    @app.get("/api/v1/documents/{document_id}/pages/{page_number}")
    def read_page(
        document_id: UUID,
        page_number: int,
        highlight_quote: str | None = None,
        db: DBSession = Depends(db_dep),
    ):
        return service.page_payload(db, document_id, page_number, highlight_quote)

    @app.delete("/api/v1/sessions/{session_id}", status_code=204)
    def delete_session(session_id: UUID, db: DBSession = Depends(db_dep)):
        session = service.get_session(db, session_id)
        db.delete(session)
        db.commit()
        return None

    return app
