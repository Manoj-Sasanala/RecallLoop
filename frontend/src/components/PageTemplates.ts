import type { RevisionItem } from "../types";

// Deterministic page templates (Notion-style "New page from template").
// No model calls: structure is fixed, revision data is read from the
// already-graded diagnosis when available.

export type PageTemplate = {
  id: string;
  icon: string;
  label: string;
  blurb: string;
};

export const PAGE_TEMPLATES: PageTemplate[] = [
  { id: "blank", icon: "📄", label: "Blank page", blurb: "Empty page for anything" },
  { id: "debrief", icon: "📝", label: "Exam debrief", blurb: "What the last exam exposed" },
  { id: "trap", icon: "🪤", label: "Misconception card", blurb: "One trap, unlearned properly" },
  { id: "examday", icon: "🎯", label: "Exam-day checklist", blurb: "Ready for the room" },
  { id: "weekly", icon: "🗓️", label: "Weekly review", blurb: "Wins, misses, next plan" },
];

export function templateContent(templateId: string, items: RevisionItem[]): { title: string; icon: string; content_md: string } {
  if (templateId === "debrief") {
    const lines = ["# Exam debrief", "", "## Score", "", "- ", "", "## What broke", ""];
    if (items.length === 0) {
      lines.push("- Sit an exam first — then list each miss here.", "");
    } else {
      for (const item of items.filter((i) => i.is_flagged_weak)) {
        lines.push(`- [ ] **${item.title}** — ${item.reason} (review by ${item.review_on})`);
      }
      lines.push("");
    }
    lines.push("## Fix plan", "", "- [ ] Re-read the source quotes for each miss", "- [ ] Redo the remediation cards", "- [ ] Retest", "");
    return { title: "Exam debrief", icon: "📝", content_md: lines.join("\n") };
  }
  if (templateId === "trap") {
    return {
      title: "Untitled trap",
      icon: "🪤",
      content_md: [
        "# Misconception card",
        "",
        "## What I believed",
        "",
        "- ",
        "",
        "## Why it is wrong",
        "",
        "- ",
        "",
        "## The correct rule",
        "",
        "- ",
        "",
        "## Source quote",
        "",
        "> ",
        "",
      ].join("\n"),
    };
  }
  if (templateId === "examday") {
    const weak = items.filter((i) => i.is_flagged_weak);
    const lines = ["# Exam-day checklist", "", "## Night before", "", "- [ ] Sleep 8 hours", "- [ ] Pack ID, pens, water", ""];
    lines.push("## Morning", "", "- [ ] Light review only — no new material", "- [ ] Breathe. You prepared for this.", "");
    lines.push("## Last look (weak spots)", "");
    if (weak.length === 0) {
      lines.push("- No weak topics flagged — trust the work.", "");
    } else {
      for (const item of weak) lines.push(`- [ ] ${item.title}`);
      lines.push("");
    }
    return { title: "Exam-day checklist", icon: "🎯", content_md: lines.join("\n") };
  }
  if (templateId === "weekly") {
    return {
      title: "Weekly review",
      icon: "🗓️",
      content_md: [
        "# Weekly review",
        "",
        "## Wins",
        "",
        "- ",
        "",
        "## Misses (and the trap behind each)",
        "",
        "- ",
        "",
        "## Next week's plan",
        "",
        "- [ ] ",
        "",
      ].join("\n"),
    };
  }
  return { title: "Untitled", icon: "📄", content_md: "" };
}
