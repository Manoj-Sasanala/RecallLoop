export type TopicNote = { text: string; reviseBy: string };

const key = (sessionId: string) => `recallloop:notes:${sessionId}`;

export function loadNotes(sessionId: string): Record<string, TopicNote> {
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TopicNote>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNote(sessionId: string, topicId: string, note: TopicNote): void {
  try {
    const all = loadNotes(sessionId);
    if (!note.text.trim() && !note.reviseBy) delete all[topicId];
    else all[topicId] = note;
    localStorage.setItem(key(sessionId), JSON.stringify(all));
  } catch {
    /* private mode or quota: notes stay in memory only */
  }
}

export function clearNotes(sessionId: string): void {
  try {
    localStorage.removeItem(key(sessionId));
  } catch {
    /* ignore */
  }
}
