"""Pre-seeded demo bundles: the exam path that never calls a model.

Judges see the full loop with zero latency and zero risk of an API hiccup; the
upload path is what demonstrates live generation.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import (
    DocumentPage,
    SourceDocument,
    StudySession,
    Topic,
    TopicEdge,
)


@dataclass(frozen=True)
class BundleQuestion:
    topic_code: str
    stem: str
    page: int
    quote: str
    cognitive_level: str
    options: tuple[dict, ...]


@dataclass(frozen=True)
class DemoBundle:
    id: str
    title: str
    course_code: str
    pages: tuple[str, ...]
    topics: tuple[dict, ...]
    questions: tuple[BundleQuestion, ...]
    retest: tuple[BundleQuestion, ...] = ()


def _option(option_id: str, text: str, correct: bool, misconception: str | None) -> dict:
    return {
        "option_id": option_id,
        "text": text,
        "is_correct": correct,
        "misconception_type": misconception,
        "rationale": "Grounded in the cited page." if correct else "Contradicts the cited page.",
    }


CS_RAFT = DemoBundle(
    id="cs_raft",
    title="CS 451 - Distributed Systems (Raft)",
    course_code="CS-451",
    pages=(
        "Raft is a consensus algorithm designed to be understandable. It decomposes consensus into "
        "leader election, log replication, and safety. A single leader is elected for each term and "
        "handles all client requests.",
        "The leader appends client commands to its log and replicates them to follower nodes. Once a "
        "majority of followers acknowledge an entry, the leader commits it and applies it to its state "
        "machine.",
        "If a follower misses heartbeats for a full election timeout, it becomes a candidate, increments "
        "the term, and requests votes. A candidate that wins a majority becomes the new leader.",
        "Raft guarantees that committed entries are never lost and that all servers apply the same "
        "commands in the same order. Safety does not depend on timing assumptions in the network.",
    ),
    topics=(
        {"code": "T1", "title": "Leader election", "weight": 0.5, "out_degree": 1, "pages": (1, 3)},
        {"code": "T2", "title": "Log replication and safety", "weight": 0.5, "out_degree": 0, "pages": (2, 4)},
    ),
    questions=(
        BundleQuestion(
            "T1",
            "A cluster loses its leader mid-term. Which component decides the replacement?",
            3,
            "it becomes a candidate increments the term and requests votes",
            "APPLICATION",
            (
                _option("A", "A follower that times out campaigns", True, None),
                _option("B", "The client picks the next leader", False, "client_authority"),
                _option("C", "The oldest node always leads", False, "seniority_rule"),
                _option("D", "The disk selects a new leader", False, "storage_controls"),
            ),
        ),
        BundleQuestion(
            "T1",
            "During normal operation, where do all client requests go?",
            1,
            "a single leader is elected for each term and handles all client requests",
            "RECALL",
            (
                _option("A", "To the elected leader node", True, None),
                _option("B", "To any random follower node", False, "request_broadcast"),
                _option("C", "To every node in the cluster", False, "request_fanout"),
                _option("D", "To the client's local storage", False, "local_authority"),
            ),
        ),
        BundleQuestion(
            "T1",
            "What triggers a follower to start an election?",
            3,
            "if a follower misses heartbeats for a full election timeout",
            "APPLICATION",
            (
                _option("A", "Missing heartbeats for a timeout", True, None),
                _option("B", "Receiving a newer term number", False, "term_confusion"),
                _option("C", "Committing an oversized log entry", False, "size_trigger"),
                _option("D", "A client requesting a leader", False, "client_authority"),
            ),
        ),
        BundleQuestion(
            "T2",
            "When is a log entry considered committed?",
            2,
            "once a majority of followers acknowledge an entry the leader commits it",
            "APPLICATION",
            (
                _option("A", "When most followers acknowledge it", True, None),
                _option("B", "When the leader writes it locally", False, "leader_only"),
                _option("C", "When every follower approves it", False, "unanimity_error"),
                _option("D", "When the client retries the request", False, "retry_equals_commit"),
            ),
        ),
        BundleQuestion(
            "T2",
            "What does Raft guarantee about committed entries?",
            4,
            "committed entries are never lost and that all servers apply the same commands",
            "RECALL",
            (
                _option("A", "They survive and apply in order", True, None),
                _option("B", "They may be reordered by followers", False, "order_confusion"),
                _option("C", "They can be dropped under load", False, "loss_under_load"),
                _option("D", "They only exist on the leader", False, "leader_only"),
            ),
        ),
        BundleQuestion(
            "T2",
            "Which assumption does Raft safety NOT rely on?",
            4,
            "safety does not depend on timing assumptions in the network",
            "ANALYSIS",
            (
                _option("A", "Accurate clock timing on nodes", True, None),
                _option("B", "Majority acknowledgement of logs", False, "quorum_confusion"),
                _option("C", "Ordered application of commands", False, "order_confusion"),
                _option("D", "Persistent storage of entries", False, "storage_confusion"),
            ),
        ),
    ),
    retest=(
        BundleQuestion(
            "T1",
            "Two candidates tie in an election and neither concedes. What decides the winner?",
            3,
            "a candidate that wins a majority becomes the new leader",
            "APPLICATION",
            (
                _option("A", "A majority of votes wins the term", True, None),
                _option("B", "The lowest node id wins the term", False, "seniority_rule"),
                _option("C", "The first to time out wins it", False, "timing_priority"),
                _option("D", "The client decides the winner", False, "client_authority"),
            ),
        ),
        BundleQuestion(
            "T1",
            "What changes on a follower that starts a new election?",
            3,
            "it becomes a candidate increments the term and requests votes",
            "RECALL",
            (
                _option("A", "It increments the term and asks for votes", True, None),
                _option("B", "It deletes its log and waits", False, "global_reset"),
                _option("C", "It keeps the old term and waits", False, "term_confusion"),
                _option("D", "It asks the client for permission", False, "client_authority"),
            ),
        ),
        BundleQuestion(
            "T2",
            "After a crash, a follower's log disagrees with the leader's. What happens next?",
            2,
            "the leader appends client commands to its log and replicates them to follower nodes",
            "APPLICATION",
            (
                _option("A", "The leader overwrites follower log", True, None),
                _option("B", "The follower keeps its own log", False, "local_authority"),
                _option("C", "The cluster resets every node", False, "global_reset"),
                _option("D", "The client resends each command", False, "retry_equals_commit"),
            ),
        ),
        BundleQuestion(
            "T2",
            "A client is told an entry succeeded. Why can that entry not be lost later?",
            4,
            "committed entries are never lost",
            "ANALYSIS",
            (
                _option("A", "A majority already stored the entry", True, None),
                _option("B", "The client keeps a local copy", False, "client_authority"),
                _option("C", "The leader never crashes afterwards", False, "leader_permanence"),
                _option("D", "The disk always writes instantly", False, "storage_confusion"),
            ),
        ),
    ),
)


MED_CARDIO = DemoBundle(
    id="med_cardio",
    title="Clinical Cardiology - Heart Failure",
    course_code="MED-512",
    pages=(
        "Heart failure with reduced ejection fraction is defined by a left ventricular ejection "
        "fraction of 40 percent or less on imaging.",
        "Guideline-directed medical therapy for reduced ejection fraction combines an ARNI or ACE "
        "inhibitor, a beta blocker, a mineralocorticoid receptor antagonist, and an SGLT2 inhibitor.",
        "Angiotensin receptor-neprilysin inhibitors reduce mortality compared with ACE inhibitors "
        "alone. Loop diuretics relieve congestion but do not improve survival.",
        "Initiation of all four therapy classes within weeks improves outcomes, and each class is "
        "started at a low dose and titrated as blood pressure and renal function allow.",
    ),
    topics=(
        {"code": "T1", "title": "Diagnosis and classification", "weight": 0.4, "out_degree": 1, "pages": (1, 2)},
        {"code": "T2", "title": "Guideline-directed therapy", "weight": 0.6, "out_degree": 0, "pages": (3, 4)},
    ),
    questions=(
        BundleQuestion(
            "T1",
            "Which ejection fraction threshold defines reduced ejection fraction?",
            1,
            "a left ventricular ejection fraction of 40 percent or less",
            "RECALL",
            (
                _option("A", "Forty percent or lower on imaging", True, None),
                _option("B", "Fifty percent or lower on imaging", False, "threshold_shift"),
                _option("C", "Sixty percent or lower on imaging", False, "threshold_shift"),
                _option("D", "Any value with breathlessness", False, "symptom_only"),
            ),
        ),
        BundleQuestion(
            "T1",
            "A patient has an ejection fraction of 52 percent. How is this classified?",
            1,
            "a left ventricular ejection fraction of 40 percent or less",
            "APPLICATION",
            (
                _option("A", "Not reduced, so not HFrEF", True, None),
                _option("B", "Reduced, so start ARNI", False, "threshold_shift"),
                _option("C", "Reduced, so start diuretic", False, "symptom_only"),
                _option("D", "Reduced, so admit to hospital", False, "severity_overreach"),
            ),
        ),
        BundleQuestion(
            "T1",
            "Which finding defines the reduced ejection fraction phenotype?",
            1,
            "defined by a left ventricular ejection fraction of 40 percent or less on imaging",
            "RECALL",
            (
                _option("A", "Low ejection fraction on imaging", True, None),
                _option("B", "Elevated filling pressures at rest", False, "pressure_confusion"),
                _option("C", "Right ventricular hypertrophy", False, "chamber_confusion"),
                _option("D", "Atrial fibrillation on rhythm strip", False, "rhythm_confusion"),
            ),
        ),
        BundleQuestion(
            "T2",
            "Which four drug classes form guideline-directed therapy?",
            2,
            "combines an ARNI or ACE inhibitor, a beta blocker, a mineralocorticoid receptor antagonist, and an SGLT2 inhibitor",
            "RECALL",
            (
                _option("A", "ARNI, beta blocker, MRA, SGLT2", True, None),
                _option("B", "ACE, statin, MRA, SGLT2 inhibitor", False, "statin_substitution"),
                _option("C", "ARNI, diuretic, MRA, beta agonist", False, "diuretic_substitution"),
                _option("D", "Beta blocker, calcium channel, MRA", False, "channel_substitution"),
            ),
        ),
        BundleQuestion(
            "T2",
            "Why is an ARNI preferred over an ACE inhibitor alone?",
            3,
            "Angiotensin receptor-neprilysin inhibitors reduce mortality compared with ACE inhibitors alone",
            "APPLICATION",
            (
                _option("A", "It lowers mortality versus ACE only", True, None),
                _option("B", "It relieves congestion faster", False, "diuretic_confusion"),
                _option("C", "It avoids all renal monitoring", False, "monitoring_myth"),
                _option("D", "It replaces the need for beta blocker", False, "class_replacement"),
            ),
        ),
        BundleQuestion(
            "T2",
            "What is the role of loop diuretics in this regimen?",
            3,
            "Loop diuretics relieve congestion but do not improve survival",
            "ANALYSIS",
            (
                _option("A", "Relieve congestion without survival benefit", True, None),
                _option("B", "Reduce mortality over several years", False, "survival_overclaim"),
                _option("C", "Replace the SGLT2 inhibitor class", False, "class_replacement"),
                _option("D", "Titrate the beta blocker safely", False, "titration_confusion"),
            ),
        ),
    ),
    retest=(
        BundleQuestion(
            "T1",
            "A patient's ejection fraction measures 35 percent. Which classification applies?",
            1,
            "a left ventricular ejection fraction of 40 percent or less",
            "APPLICATION",
            (
                _option("A", "Reduced ejection fraction, so HFrEF", True, None),
                _option("B", "Preserved fraction, so not HFrEF", False, "threshold_shift"),
                _option("C", "Borderline fraction, so observe", False, "threshold_shift"),
                _option("D", "Normal fraction, so discharge", False, "threshold_shift"),
            ),
        ),
        BundleQuestion(
            "T1",
            "Which measurement must be low before HFrEF is diagnosed?",
            1,
            "a left ventricular ejection fraction of 40 percent or less on imaging",
            "RECALL",
            (
                _option("A", "Left ventricular ejection fraction", True, None),
                _option("B", "Right atrial pressure", False, "pressure_confusion"),
                _option("C", "Serum sodium level", False, "lab_confusion"),
                _option("D", "Resting heart rate", False, "rhythm_confusion"),
            ),
        ),
        BundleQuestion(
            "T2",
            "A patient cannot tolerate an ACE inhibitor. Which class still lowers mortality?",
            3,
            "Angiotensin receptor-neprilysin inhibitors reduce mortality compared with ACE inhibitors",
            "APPLICATION",
            (
                _option("A", "An ARNI replaces it and lowers risk", True, None),
                _option("B", "A loop diuretic replaces it fully", False, "class_replacement"),
                _option("C", "A calcium channel blocks the risk", False, "channel_substitution"),
                _option("D", "No other class lowers the risk", False, "therapeutic_nihilism"),
            ),
        ),
        BundleQuestion(
            "T2",
            "Which medication eases breathlessness but does not extend survival?",
            3,
            "Loop diuretics relieve congestion but do not improve survival",
            "ANALYSIS",
            (
                _option("A", "A loop diuretic for congestion", True, None),
                _option("B", "An ARNI for long-term survival", False, "class_replacement"),
                _option("C", "A beta blocker for survival gain", False, "class_replacement"),
                _option("D", "An SGLT2 inhibitor for survival", False, "class_replacement"),
            ),
        ),
    ),
)


BUNDLES = {bundle.id: bundle for bundle in (CS_RAFT, MED_CARDIO)}


def seed_session(db, bundle: DemoBundle) -> StudySession:
    session = StudySession(
        title=bundle.title,
        course_code=bundle.course_code,
        demo_bundle_id=bundle.id,
        status="BLUEPRINT_READY",
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    document = SourceDocument(
        session_id=session.id,
        filename=f"{bundle.id}.pdf",
        doc_role="STUDY_MATERIAL",
        sha256_hash=f"demo-{bundle.id}",
        page_count=len(bundle.pages),
        file_size_bytes=0,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    for index, text in enumerate(bundle.pages, start=1):
        db.add(
            DocumentPage(
                document_id=document.id,
                page_number=index,
                raw_text=text,
                normalized_text=text.lower(),
                token_count=len(text.split()),
            )
        )

    topics = {}
    for spec in bundle.topics:
        topic = Topic(
            session_id=session.id,
            code=spec["code"],
            title=spec["title"],
            description=spec["title"],
            syllabus_weight=spec["weight"],
            out_degree=spec["out_degree"],
            source_page_refs=[{"doc_id": str(document.id), "start_page": spec["pages"][0], "end_page": spec["pages"][-1]}],
        )
        db.add(topic)
        db.commit()
        db.refresh(topic)
        topics[spec["code"]] = topic

    prerequisites = [t for t in bundle.topics if t["out_degree"] > 0]
    if prerequisites:
        db.add(
            TopicEdge(
                session_id=session.id,
                prerequisite_topic_id=topics[prerequisites[0]["code"]].id,
                dependent_topic_id=topics[bundle.topics[-1]["code"]].id,
                rationale="Later units assume the earlier mechanism.",
            )
        )
    db.commit()
    return session
