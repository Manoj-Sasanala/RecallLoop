import type {
  Answer,
  Delta,
  Exam,
  GradeResult,
  NotesPayload,
  PagePayload,
  RemediationPlan,
  RevisionItem,
  Session,
  SessionPlan,
  SessionSummary,
  Topic,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function createSession(title: string, demoBundleId?: string): Promise<Session> {
  return request("/api/v1/sessions", json({ title, demo_bundle_id: demoBundleId ?? null }));
}

export async function uploadDocuments(sessionId: string, files: File[]): Promise<number> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
    form.append("doc_roles", "STUDY_MATERIAL");
  }
  const body = await request<{ documents: { page_count: number }[] }>(
    `/api/v1/sessions/${sessionId}/documents`,
    { method: "POST", body: form },
  );
  return body.documents.reduce((total, doc) => total + doc.page_count, 0);
}

export async function extractBlueprint(sessionId: string): Promise<Topic[]> {
  const body = await request<{ topics: Topic[] }>(
    `/api/v1/sessions/${sessionId}/blueprint/extract`,
    json({ target_question_count: 8 }),
  );
  return body.topics;
}

export async function generateExam(
  sessionId: string,
  questionCount: number,
  onProgress: (step: string) => void,
): Promise<Exam> {
  const response = await fetch(`/api/v1/sessions/${sessionId}/exams/generate`, json({ question_count: questionCount }));
  if (!response.ok || !response.body) throw new Error("generation request failed");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let exam: Exam | null = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === "progress") onProgress(payload.step);
      if (event === "error") throw new Error(payload.detail);
      if (event === "complete") exam = payload as Exam;
    }
  }
  if (!exam) throw new Error("generation ended without an exam");
  return exam;
}

export function submitExam(examId: string, responses: Answer[], timeElapsedSec: number): Promise<GradeResult> {
  return request(`/api/v1/exams/${examId}/submit`, json({ responses, time_elapsed_sec: timeElapsedSec }));
}

export function remediate(examId: string): Promise<RemediationPlan> {
  return request(`/api/v1/exams/${examId}/remediate`, json({ max_weak_topics: 3, retest_question_count: 5 }));
}

export function getDelta(sessionId: string): Promise<Delta> {
  return request(`/api/v1/sessions/${sessionId}/progress-delta`);
}

export function listSessions(): Promise<{ sessions: SessionSummary[] }> {
  return request("/api/v1/sessions");
}

export function getNotes(sessionId: string): Promise<NotesPayload> {
  return request(`/api/v1/sessions/${sessionId}/notes`);
}

export function saveNotes(sessionId: string, notesMd: string): Promise<NotesPayload> {
  return request(`/api/v1/sessions/${sessionId}/notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes_md: notesMd }),
  });
}

export function getRevision(sessionId: string): Promise<{ session_id: string; items: RevisionItem[] }> {
  return request(`/api/v1/sessions/${sessionId}/revision`);
}

export function transcribeAudio(blob: Blob, prompt?: string): Promise<{ text: string; language?: string; duration_s?: number }> {
  const form = new FormData();
  form.append("audio", blob, "utterance.webm");
  if (prompt && prompt.trim()) {
    form.append("prompt", prompt.trim());
  }
  return request("/api/v1/speech/transcribe", { method: "POST", body: form });
}

export function getPlan(sessionId: string): Promise<SessionPlan> {
  return request(`/api/v1/sessions/${sessionId}/plan`);
}

export function savePlan(sessionId: string, examDate: string | null, stage: string): Promise<SessionPlan> {
  return request(`/api/v1/sessions/${sessionId}/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam_date: examDate, stage }),
  });
}

export function getPage(docId: string, pageNumber: number, quote?: string): Promise<PagePayload> {
  const query = quote ? `?highlight_quote=${encodeURIComponent(quote)}` : "";
  return request(`/api/v1/documents/${docId}/pages/${pageNumber}${query}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`/api/v1/sessions/${sessionId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("delete failed");
}
