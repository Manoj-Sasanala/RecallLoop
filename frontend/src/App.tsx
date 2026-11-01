import { useEffect, useMemo, useState } from "react";
import {
  createSession,
  deleteSession,
  extractBlueprint,
  generateExam,
  getDelta,
  getNotes,
  getPlan,
  getRevision,
  listSessions,
  remediate,
  saveNotes,
  submitExam,
  uploadDocuments,
} from "./api";
import { Assistant, type AssistantActions, type AssistantContext, type AssistantSessionRef } from "./components/Assistant";
import { Blueprint } from "./components/Blueprint";
import { DeltaView } from "./components/DeltaView";
import { Exam } from "./components/Exam";
import { Home } from "./components/Home";
import { NotesView } from "./components/NotesView";
import { QuoteDrawer } from "./components/QuoteDrawer";
import { Remediation } from "./components/Remediation";
import { Results } from "./components/Results";
import { Setup } from "./components/Setup";
import { Shell } from "./components/Shell";
import type {
  Answer,
  Delta,
  Exam as ExamData,
  GradeResult,
  RemediationPlan,
  RevisionItem,
  Session,
  SessionPlan,
  SessionSummary,
  Stage,
  Topic,
} from "./types";

type View = Stage | "retest" | "notes";

const STEP_BY_VIEW: Record<View, number> = {
  home: 0,
  setup: 0,
  blueprint: 0,
  exam: 1,
  results: 1,
  remediation: 2,
  retest: 3,
  delta: 3,
  notes: 0,
};

const PROGRESS: Record<string, string> = {
  GENERATING: "Writing questions from the source...",
  VERIFYING_QUOTES: "Checking every quote against the page...",
  REPAIRING: "Repairing items that failed verification...",
};

export default function App() {
  const [view, setView] = useState<View>("home");
  const [homeToken, setHomeToken] = useState(0);
  const [notesTarget, setNotesTarget] = useState<SessionSummary | null>(null);
  const [assistantPlan, setAssistantPlan] = useState<SessionPlan | null>(null);
  const [assistantRevision, setAssistantRevision] = useState<RevisionItem[]>([]);
  const [assistantDelta, setAssistantDelta] = useState<Delta | null>(null);
  const [assistantSessions, setAssistantSessions] = useState<AssistantSessionRef[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [plan, setPlan] = useState<RemediationPlan | null>(null);
  const [delta, setDelta] = useState<Delta | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<{ page: number; quote: string } | null>(null);
  const [resultsTab, setResultsTab] = useState<"diagnosis" | "board" | "graph">("diagnosis");

  const run = async (busyText: string, work: () => Promise<void>) => {
    setBusy(busyText);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setView("home");
    setHomeToken((t) => t + 1);
    setSession(null);
    setTopics([]);
    setExam(null);
    setGrade(null);
    setPlan(null);
    setDelta(null);
    setError(null);
    setQuoted(null);
    setNotesTarget(null);
    setAssistantPlan(null);
    setAssistantRevision([]);
    setAssistantDelta(null);
  };

  useEffect(() => {
    let live = true;
    listSessions()
      .then((body) => live && setAssistantSessions(body.sessions.map((s) => ({ id: s.session_id, title: s.title }))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [homeToken, session?.session_id]);

  useEffect(() => {
    const id = session?.session_id;
    if (!id) {
      setAssistantPlan(null);
      setAssistantRevision([]);
      setAssistantDelta(null);
      return;
    }
    let live = true;
    getPlan(id)
      .then((p) => live && setAssistantPlan(p))
      .catch(() => undefined);
    getRevision(id)
      .then((r) => live && setAssistantRevision(r.items))
      .catch(() => undefined);
    getDelta(id)
      .then((d) => live && setAssistantDelta(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session?.session_id, delta?.rounds.length, grade?.exam_attempt_id, homeToken]);

  const openSession = (summary: SessionSummary) =>
    run("Opening session...", async () => {
      const res = await fetch(`/api/v1/sessions/${summary.session_id}`);
      if (!res.ok) throw new Error("session not found");
      const full = (await res.json()) as Session;
      setSession(full);
      setBusy("Loading topics...");
      const extracted = await extractBlueprint(full.session_id);
      setTopics(extracted);
      setView("blueprint");
    });

  const purgeSummary = (summary: SessionSummary) =>
    run("Deleting session data...", async () => {
      if (!window.confirm(`Delete "${summary.title}" and all its data?`)) return;
      await deleteSession(summary.session_id);
      if (session?.session_id === summary.session_id) {
        reset();
        return;
      }
      setHomeToken((t) => t + 1);
    });

  const startDemo = (bundleId: string) =>
    run("Preparing the seeded course...", async () => {
      const created = await createSession(bundleId === "med_cardio" ? "Clinical Cardiology" : "Distributed Systems", bundleId);
      setSession(created);
      const extracted = await extractBlueprint(created.session_id);
      setTopics(extracted);
      setView("blueprint");
    });

  const startUpload = (title: string, files: File[]) =>
    run("Reading your PDF...", async () => {
      const created = await createSession(title);
      setSession(created);
      await uploadDocuments(created.session_id, files);
      setBusy("Mapping topics and page ranges with the model...");
      const extracted = await extractBlueprint(created.session_id);
      setTopics(extracted);
      setView("blueprint");
    });

  const buildExam = () =>
    run("Starting generation...", async () => {
      if (!session) throw new Error("no session");
      const generated = await generateExam(session.session_id, session.demo_bundle_id ? 6 : 8, (step) =>
        setBusy(PROGRESS[step] ?? "Working..."),
      );
      if (generated.questions.length === 0) throw new Error("No question passed source verification. Try again.");
      setExam(generated);
      setView("exam");
    });

  const gradeExam = (answers: Answer[], elapsed: number) =>
    run("Grading with the deterministic engine...", async () => {
      if (!exam) throw new Error("no exam");
      const result = await submitExam(exam.exam_attempt_id, answers, elapsed);
      setGrade(result);
      setView("results");
    });

  const buildRemediation = () =>
    run("Building your remediation cards...", async () => {
      if (!grade) throw new Error("no graded exam");
      const result = await remediate(grade.exam_attempt_id);
      setPlan(result);
      setView("remediation");
    });

  const startRetest = () => {
    if (!plan) return;
    setExam({
      exam_attempt_id: plan.retest_exam_attempt_id,
      time_limit_sec: 300,
      questions: plan.retest_questions,
      cache_hit_tokens: 0,
      repairs: 0,
    });
    setView("retest");
  };

  const gradeRetest = (answers: Answer[], elapsed: number) =>
    run("Grading the retest...", async () => {
      if (!exam || !session) throw new Error("no exam");
      await submitExam(exam.exam_attempt_id, answers, elapsed);
      const result = await getDelta(session.session_id);
      setDelta(result);
      setView("delta");
    });

  const docId = topics[0]?.page_refs[0]?.doc_id ?? "";

  const assistantActs: AssistantActions = {
    goHome: () => {
      setSession(null);
      setView("home");
      setHomeToken((t) => t + 1);
    },
    openSession: (id: string) => {
      const found = (assistantSessions ?? []).find((s) => s.id === id);
      if (!found) return;
      openSession({ session_id: found.id, title: found.title } as SessionSummary);
    },
    openNotes: () => {
      if (!session) return;
      setNotesTarget({ session_id: session.session_id, title: session.title } as SessionSummary);
      setView("notes");
    },
    purgeCurrent: () => {
      if (!session) return;
      void run("Deleting session data...", async () => {
        if (!window.confirm(`Delete "${session.title}" and all its data?`)) return;
        await deleteSession(session.session_id);
        reset();
      });
    },
    purgeSession: (id: string, title: string) => {
      purgeSummary({ session_id: id, title } as SessionSummary);
    },
    appendNote: (text: string) => {
      if (!session) return;
      const id = session.session_id;
      const stamp = new Date().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      void (async () => {
        try {
          const current = await getNotes(id);
          const base = current.notes_md?.trim() ? `${current.notes_md.trim()}\n` : "";
          await saveNotes(id, `${base}- [voice ${stamp}] ${text}`);
          setHomeToken((t) => t + 1);
        } catch {
          setError("Could not save the note — try again from the Notes screen.");
        }
      })();
    },
    navigateView: (target: string) => {
      if (["setup", "home", "blueprint", "exam", "results", "remediation", "retest", "delta", "notes"].includes(target)) {
        setView(target as View);
      }
    },
    setResultsTab: (tab: "diagnosis" | "board" | "graph") => {
      setResultsTab(tab);
      setView("results");
    },
    startExam: () => {
      if (session) void buildExam();
    },
    startRemediation: () => {
      if (grade) void buildRemediation();
    },
  };

  const assistantCtx = useMemo(assistantContext, [session, grade, delta, assistantPlan, assistantRevision, assistantDelta, assistantSessions, view]);

  return (
    <>
      <Shell
        activeStep={STEP_BY_VIEW[view]}
        session={session}
        onPurge={
          session
            ? () =>
                run("Deleting session data...", async () => {
                  if (!window.confirm(`Delete "${session.title}" and all its data?`)) return;
                  await deleteSession(session.session_id);
                  reset();
                })
            : undefined
        }
        onHome={() => {
          setSession(null);
          setView("home");
          setHomeToken((t) => t + 1);
        }}
      >
      {error && (
        <div className="error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}
      {busy && (
        <div className="waiting" role="status" aria-live="polite" style={{ marginBottom: 16 }}>
          <span className="pulse" aria-hidden="true" />
          {busy}
        </div>
      )}

      {view === "home" && (
        <Home
          refreshToken={homeToken}
          onNew={() => setView("setup")}
          onOpen={openSession}
          onNotes={(s) => {
            setNotesTarget(s);
            setView("notes");
          }}
          onPurge={purgeSummary}
        />
      )}

      {view === "notes" && notesTarget && (
        <NotesView
          sessionId={notesTarget.session_id}
          title={notesTarget.title}
          onBack={() => {
            setNotesTarget(null);
            setHomeToken((t) => t + 1);
            setView(session ? "delta" : "home");
          }}
        />
      )}

      {view === "setup" && <Setup onDemo={startDemo} onUpload={startUpload} busy={Boolean(busy)} />}

      {view === "blueprint" && (
        <Blueprint
          topics={topics}
          busy={Boolean(busy)}
          onGenerate={buildExam}
          onOpenQuote={(page, quote) => setQuoted({ page, quote })}
        />
      )}

      {view === "exam" && exam && (
        <Exam exam={exam} mode="diagnostic" busy={Boolean(busy)} onSubmit={gradeExam} />
      )}

      {view === "results" && grade && exam && (
        <Results
          grade={grade}
          exam={exam}
          topics={topics}
          busy={Boolean(busy)}
          tab={resultsTab}
          onTabChange={setResultsTab}
          onRemediate={buildRemediation}
          onOpenQuote={(page, quote) => setQuoted({ page, quote })}
        />
      )}

      {view === "remediation" && plan && (
        <Remediation
          plan={plan}
          busy={Boolean(busy)}
          onRetest={startRetest}
          onOpenQuote={(page, quote) => setQuoted({ page, quote })}
        />
      )}

      {view === "retest" && exam && <Exam exam={exam} mode="retest" busy={Boolean(busy)} onSubmit={gradeRetest} />}

      {view === "delta" && delta && (
        <DeltaView
          delta={delta}
          grade={grade}
          plan={plan}
          sessionTitle={session?.title ?? "session"}
          mode={session?.demo_bundle_id ? "demo" : "uploaded"}
          onRestart={reset}
        />
      )}

      {quoted && docId && (
        <QuoteDrawer docId={docId} page={quoted.page} quote={quoted.quote} onClose={() => setQuoted(null)} />
      )}
      </Shell>
      <Assistant context={assistantCtx} actions={assistantActs} />
    </>
  );

  function assistantContext(): AssistantContext {
    const liveDelta = delta ?? assistantDelta;
    const weak = (
      grade?.topic_breakdown.filter((t) => t.is_flagged_weak).map((t) => ({ title: t.title })) ?? []
    );
    const weakFallback =
      weak.length > 0
        ? weak
        : assistantRevision.filter((r) => r.is_flagged_weak).map((r) => ({ title: r.title }));
    const rounds = liveDelta?.rounds.length ?? (grade ? 1 : 0);
    const lastMastery =
      liveDelta && liveDelta.rounds.length > 0
        ? liveDelta.rounds[liveDelta.rounds.length - 1].mastery_score
        : (grade?.summary.mastery_score ?? null);
    const next = assistantRevision[0];
    const examDate = assistantPlan?.exam_date ?? null;
    let countdown: string | null = null;
    if (examDate) {
      const days = Math.round(
        (new Date(examDate + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
      );
      countdown = days >= 0 ? `Exam in ${days} days (${assistantPlan?.stage.replace("_", " ")}).` : "Exam date passed.";
    }
    return {
      view,
      sessionTitle: session?.title ?? null,
      hasTopics: topics.length > 0,
      hasExam: exam !== null,
      hasGrade: grade !== null,
      rounds,
      lastMastery,
      weakTopics: weakFallback,
      reviseNext: next ? `Revise ${next.title} by ${next.review_on}.` : null,
      examCountdown: countdown,
      sessions: assistantSessions,
      topics: topics.map((t) => ({ id: t.topic_id, title: t.title, code: t.code, summary: t.code })),
    };
  }
}
