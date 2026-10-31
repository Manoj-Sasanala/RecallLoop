import { useEffect, useRef, useState } from "react";
import type { Answer, Exam as ExamData } from "../types";

type Draft = { option: string; confidence: 0 | 1 | null; time_spent_ms: number };

function clock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Exam({
  exam,
  mode,
  busy,
  onSubmit,
}: {
  exam: ExamData;
  mode: "diagnostic" | "retest";
  busy: boolean;
  onSubmit: (answers: Answer[], timeElapsedSec: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Draft>>({});
  const [remaining, setRemaining] = useState(exam.time_limit_sec);

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const startedAt = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const submitted = useRef(false);

  const question = exam.questions[index];
  const draft = answers[question.question_id];
  const answeredCount = exam.questions.filter((item) => {
    const entry = answers[item.question_id];
    return entry?.option && entry.confidence !== null;
  }).length;
  const allAnswered = answeredCount === exam.questions.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setRemaining(exam.time_limit_sec - elapsed);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [exam.time_limit_sec]);

  useEffect(() => {
    if (remaining > 0 || submitted.current) return;
    submitted.current = true;
    const payload = exam.questions
      .filter((item) => answersRef.current[item.question_id]?.confidence !== null && answersRef.current[item.question_id]?.option)
      .map((item) => {
        const entry = answersRef.current[item.question_id];
        return {
          question_id: item.question_id,
          selected_option_id: entry.option,
          confidence_level: entry.confidence as 0 | 1,
          time_spent_ms: entry.time_spent_ms,
        };
      });
    submitRef.current(payload, exam.time_limit_sec);
  }, [remaining, exam.questions, exam.time_limit_sec]);

  const pick = (option: string) => {
    setAnswers((current) => ({
      ...current,
      [question.question_id]: {
        option,
        confidence: current[question.question_id]?.confidence ?? null,
        time_spent_ms: Date.now() - shownAt.current,
      },
    }));
  };

  const setConfidence = (confidence: 0 | 1) => {
    setAnswers((current) => {
      const existing = current[question.question_id];
      if (!existing) return current;
      return {
        ...current,
        [question.question_id]: { ...existing, confidence, time_spent_ms: Date.now() - shownAt.current },
      };
    });
  };

  const goTo = (next: number) => {
    setIndex(next);
    shownAt.current = Date.now();
  };

  const manualSubmit = () => {
    if (!allAnswered || submitted.current) return;
    submitted.current = true;
    const payload = exam.questions.map((item) => ({
      question_id: item.question_id,
      selected_option_id: answers[item.question_id].option,
      confidence_level: answers[item.question_id].confidence as 0 | 1,
      time_spent_ms: answers[item.question_id].time_spent_ms,
    }));
    submitRef.current(payload, Math.min(exam.time_limit_sec, Math.floor((Date.now() - startedAt.current) / 1000)));
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {mode === "retest" ? "Targeted retest" : "Diagnostic exam"} &middot; question {index + 1} of{" "}
            {exam.questions.length}
          </div>
          <h1>{mode === "retest" ? "Same ideas, new questions." : "Answer, then say how sure you are."}</h1>
          <p className="lede">
            Confidence changes the diagnosis. A confident wrong answer is a misconception; an unsure wrong answer is a
            gap you already recognise.
          </p>
        </div>
        <span className="timer" data-low={remaining < 60} role="timer" aria-label="Time remaining">
          {clock(remaining)}
        </span>
      </header>

      <div className="exam-layout">
        <section className="panel" aria-labelledby="stem">
          <div className="q-counter">
            {question.cognitive_level} &middot; {answeredCount}/{exam.questions.length} answered
          </div>
          <h2 className="stem" id="stem">
            {question.question_stem}
          </h2>

          <div className="options" role="group" aria-labelledby="stem">
            {question.options.map((option) => (
              <button
                key={option.option_id}
                type="button"
                className="option"
                aria-pressed={draft?.option === option.option_id}
                onClick={() => pick(option.option_id)}
              >
                <span className="key" aria-hidden="true">{option.option_id}</span>
                <span>{option.text}</span>
              </button>
            ))}
          </div>

          <div className="confidence">
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 style={{ fontFamily: "var(--sans)", fontSize: "0.9rem" }}>How sure are you?</h3>
              <span className="exam-note">Required for every answer</span>
            </div>
            <div className="confidence-row" role="group" aria-label="Confidence">
              <button
                type="button"
                className="conf"
                aria-pressed={draft?.confidence === 0}
                disabled={!draft}
                onClick={() => setConfidence(0)}
              >
                Guessing
              </button>
              <button
                type="button"
                className="conf"
                aria-pressed={draft?.confidence === 1}
                disabled={!draft}
                onClick={() => setConfidence(1)}
              >
                Confident
              </button>
            </div>
          </div>

          <div className="exam-foot">
            <button className="btn" onClick={() => goTo(index - 1)} disabled={index === 0 || busy}>
              Previous
            </button>
            <span className="spacer" />
            {index < exam.questions.length - 1 ? (
              <button
                className="btn primary"
                onClick={() => goTo(index + 1)}
                disabled={!draft?.option || draft.confidence === null || busy}
              >
                Next question
              </button>
            ) : (
              <button className="btn primary" onClick={manualSubmit} disabled={!allAnswered || busy}>
                Submit exam
              </button>
            )}
          </div>
        </section>

        <aside className="panel nav-panel" aria-label="Question navigator">
          <h3>Questions</h3>
          <div className="dots">
            {exam.questions.map((item, position) => (
              <button
                key={item.question_id}
                type="button"
                data-answered={Boolean(answers[item.question_id]?.option && answers[item.question_id]?.confidence !== null)}
                data-current={position === index}
                onClick={() => goTo(position)}
                aria-label={`Question ${position + 1}${answers[item.question_id]?.confidence != null ? ", answered" : ""}`}
                aria-current={position === index}
              >
                {position + 1}
              </button>
            ))}
          </div>
          <div className="legend">
            <span>Tinted = answered</span>
            <span>Submit enables when all are done.</span>
          </div>
        </aside>
      </div>
    </>
  );
}
