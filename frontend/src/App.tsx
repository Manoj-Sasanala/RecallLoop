import { useState } from "react";
import {
  createSession,
  deleteSession,
  extractBlueprint,
  generateExam,
  getDelta,
  remediate,
  submitExam,
  uploadDocuments,
} from "./api";
import { Blueprint } from "./components/Blueprint";
import { DeltaView } from "./components/DeltaView";
import { Exam } from "./components/Exam";
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
  Session,
  Stage,
  Topic,
} from "./types";

type View = Stage | "retest";

const STEP_BY_VIEW: Record<View, number> = {
  setup: 0,
  blueprint: 0,
  exam: 1,
  results: 1,
  remediation: 2,
  retest: 3,
  delta: 3,
};

const PROGRESS: Record<string, string> = {
  GENERATING: "Writing questions from the source...",
  VERIFYING_QUOTES: "Checking every quote against the page...",
  REPAIRING: "Repairing items that failed verification...",
};

export default function App() {
  const [view, setView] = useState<View>("setup");
  const [session, setSession] = useState<Session | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [exam, setExam] = useState<ExamData | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [plan, setPlan] = useState<RemediationPlan | null>(null);
  const [delta, setDelta] = useState<Delta | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quoted, setQuoted] = useState<{ page: number; quote: string } | null>(null);

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
    setView("setup");
    setSession(null);
    setTopics([]);
    setExam(null);
    setGrade(null);
    setPlan(null);
    setDelta(null);
    setError(null);
    setQuoted(null);
  };

  const purge = () =>
    run("Deleting session data...", async () => {
      if (!session) return;
      await deleteSession(session.session_id);
      reset();
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

  return (
    <Shell activeStep={STEP_BY_VIEW[view]} session={session} onPurge={session ? purge : undefined}>
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

      {view === "setup" && <Setup onDemo={startDemo} onUpload={startUpload} busy={Boolean(busy)} />}

      {view === "blueprint" && <Blueprint topics={topics} busy={Boolean(busy)} onGenerate={buildExam} />}

      {view === "exam" && exam && (
        <Exam exam={exam} mode="diagnostic" busy={Boolean(busy)} onSubmit={gradeExam} />
      )}

      {view === "results" && grade && exam && (
        <Results
          grade={grade}
          exam={exam}
          busy={Boolean(busy)}
          onRemediate={buildRemediation}
          onOpenQuote={(page, quote) => setQuoted({ page, quote })}
        />
      )}

      {view === "remediation" && plan && <Remediation plan={plan} busy={Boolean(busy)} onRetest={startRetest} />}

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
  );
}
