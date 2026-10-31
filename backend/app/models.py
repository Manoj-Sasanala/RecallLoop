"""Nine-table persistence schema for RecallLoop (SQLModel / SQLite)."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SessionStatus(str, Enum):
    IDLE = "IDLE"
    INGESTING = "INGESTING"
    BLUEPRINT_READY = "BLUEPRINT_READY"
    EXAM_READY = "EXAM_READY"
    COMPLETED = "COMPLETED"


class DocRole(str, Enum):
    SYLLABUS = "SYLLABUS"
    STUDY_MATERIAL = "STUDY_MATERIAL"


class RelationshipType(str, Enum):
    PREREQUISITE = "PREREQUISITE"
    COREQUISITE = "COREQUISITE"


class ExamType(str, Enum):
    INITIAL_DIAGNOSTIC = "INITIAL_DIAGNOSTIC"
    TARGETED_RETEST = "TARGETED_RETEST"


class CognitiveLevel(str, Enum):
    RECALL = "RECALL"
    APPLICATION = "APPLICATION"
    ANALYSIS = "ANALYSIS"


class DiagnosticState(str, Enum):
    MASTERED = "MASTERED"
    FRAGILE_GUESS = "FRAGILE_GUESS"
    RECOGNIZED_GAP = "RECOGNIZED_GAP"
    LURE_ENTRAPMENT = "LURE_ENTRAPMENT"


class StudySession(SQLModel, table=True):
    __tablename__ = "study_session"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    title: str
    course_code: Optional[str] = None
    demo_bundle_id: Optional[str] = None
    status: SessionStatus = Field(default=SessionStatus.IDLE, index=True)
    cached_prefix_hash: Optional[str] = None
    total_tokens_cached: int = 0
    created_at: datetime = Field(default_factory=utcnow, index=True)


class SourceDocument(SQLModel, table=True):
    __tablename__ = "source_document"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="study_session.id", ondelete="CASCADE", index=True)
    filename: str
    doc_role: DocRole
    sha256_hash: str = Field(index=True)
    page_count: int
    file_size_bytes: int
    uploaded_at: datetime = Field(default_factory=utcnow)


class DocumentPage(SQLModel, table=True):
    __tablename__ = "document_page"
    __table_args__ = (UniqueConstraint("document_id", "page_number"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    document_id: UUID = Field(foreign_key="source_document.id", ondelete="CASCADE", index=True)
    page_number: int
    raw_text: str = ""
    normalized_text: str = ""
    has_visual_diagram: bool = False
    page_image_b64: Optional[str] = None
    token_count: int = 0


class Topic(SQLModel, table=True):
    __tablename__ = "topic"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="study_session.id", ondelete="CASCADE", index=True)
    code: str
    title: str
    description: str = ""
    syllabus_weight: float = 0.0
    source_page_refs: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    out_degree: int = 0


class TopicEdge(SQLModel, table=True):
    __tablename__ = "topic_edge"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="study_session.id", ondelete="CASCADE", index=True)
    prerequisite_topic_id: UUID = Field(foreign_key="topic.id", ondelete="CASCADE")
    dependent_topic_id: UUID = Field(foreign_key="topic.id", ondelete="CASCADE")
    relationship_type: RelationshipType = RelationshipType.PREREQUISITE
    rationale: str = ""


class ExamAttempt(SQLModel, table=True):
    __tablename__ = "exam_attempt"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    session_id: UUID = Field(foreign_key="study_session.id", ondelete="CASCADE", index=True)
    parent_attempt_id: Optional[UUID] = Field(default=None, foreign_key="exam_attempt.id")
    round_number: int = 1
    exam_type: ExamType = ExamType.INITIAL_DIAGNOSTIC
    time_limit_sec: int = 600
    time_elapsed_sec: Optional[int] = None
    raw_accuracy: Optional[float] = None
    mastery_score: Optional[float] = None
    mce_score: Optional[float] = None
    lure_persistence_rate: Optional[float] = None
    muse_response_id: Optional[str] = None
    started_at: datetime = Field(default_factory=utcnow)
    submitted_at: Optional[datetime] = None


class Question(SQLModel, table=True):
    __tablename__ = "question"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    exam_attempt_id: UUID = Field(foreign_key="exam_attempt.id", ondelete="CASCADE", index=True)
    topic_id: UUID = Field(foreign_key="topic.id", index=True)
    source_doc_id: UUID = Field(foreign_key="source_document.id")
    display_order: int = 0
    question_stem: str
    cognitive_level: CognitiveLevel = CognitiveLevel.RECALL
    source_page_number: int
    verbatim_source_quote: str
    quote_match_ratio: float = 0.0
    options_json: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    correct_option_id: str
    target_misconception_tested: Optional[str] = None


class QuestionAttempt(SQLModel, table=True):
    __tablename__ = "question_attempt"
    __table_args__ = (UniqueConstraint("exam_attempt_id", "question_id"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    exam_attempt_id: UUID = Field(foreign_key="exam_attempt.id", ondelete="CASCADE", index=True)
    question_id: UUID = Field(foreign_key="question.id", ondelete="CASCADE")
    selected_option_id: str
    confidence_level: int
    is_correct: bool
    diagnostic_state: DiagnosticState
    penalty_weight: float = 0.0
    endorsed_misconception: Optional[str] = None
    time_spent_ms: int = 0


class TopicMasterySnapshot(SQLModel, table=True):
    __tablename__ = "topic_mastery_snapshot"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    exam_attempt_id: UUID = Field(foreign_key="exam_attempt.id", ondelete="CASCADE", index=True)
    topic_id: UUID = Field(foreign_key="topic.id", index=True)
    raw_accuracy: float = 0.0
    mastery_score: float = 0.0
    vulnerability_score: float = 0.0
    is_flagged_weak: bool = False
    trapped_misconceptions_json: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    remediation_markdown: Optional[str] = None
    worked_example_markdown: Optional[str] = None
