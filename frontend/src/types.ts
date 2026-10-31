export type Stage = "setup" | "blueprint" | "exam" | "results" | "remediation" | "delta";

export type Session = {
  session_id: string;
  title: string;
  course_code: string | null;
  status: string;
  demo_bundle_id: string | null;
  created_at: string;
};

export type Topic = {
  topic_id: string;
  code: string;
  title: string;
  syllabus_weight: number;
  allocated_questions: number;
  out_degree: number;
  page_refs: { doc_id: string; start_page: number; end_page: number }[];
  prerequisites: string[];
};

export type Option = { option_id: string; text: string };

export type ExamQuestion = {
  question_id: string;
  display_order: number;
  question_stem: string;
  cognitive_level: string;
  options: Option[];
};

export type Exam = {
  exam_attempt_id: string;
  time_limit_sec: number;
  questions: ExamQuestion[];
  cache_hit_tokens: number;
  repairs: number;
};

export type Answer = {
  question_id: string;
  selected_option_id: string;
  confidence_level: 0 | 1;
  time_spent_ms: number;
};

export type TopicResult = {
  topic_id: string;
  title: string;
  raw_accuracy: number;
  mastery_score: number;
  vulnerability_score: number;
  is_flagged_weak: boolean;
  trapped_misconceptions: string[];
};

export type GradedItem = {
  question_id: string;
  stem: string;
  source_page_number: number;
  verbatim_source_quote: string;
  selected_option_id: string;
  selected_option_text: string;
  correct_option_id: string;
  is_correct: boolean;
  diagnostic_state: string;
  endorsed_misconception: string | null;
  rationale: string;
};

export type GradeResult = {
  exam_attempt_id: string;
  summary: {
    raw_accuracy: number;
    mastery_score: number;
    mce_score: number;
    lure_persistence_rate: number;
    state_counts: Record<string, number>;
  };
  topic_breakdown: TopicResult[];
  graded_items: GradedItem[];
};

export type RemediationCard = {
  topic_id: string;
  topic_title: string;
  trapped_misconception: string | null;
  source_truth_quote: string;
  source_page: number;
  corrective_explanation_md: string;
  worked_example_md: string;
};

export type RemediationPlan = {
  parent_attempt_id: string;
  remediation_cards: RemediationCard[];
  retest_exam_attempt_id: string;
  retest_questions: ExamQuestion[];
};

export type Delta = {
  session_id: string;
  rounds: {
    exam_attempt_id: string;
    round_number: number;
    raw_accuracy: number;
    mastery_score: number;
    mce_score: number;
    lure_persistence_rate: number;
  }[];
  topic_deltas: {
    topic_id: string;
    title: string;
    initial_accuracy: number;
    retest_accuracy: number;
    initial_mastery: number;
    retest_mastery: number;
    delta_mastery: number;
  }[];
  overall_mce_delta: number;
  lure_resolution_rate: number;
};

export type PagePayload = {
  doc_id: string;
  page_number: number;
  raw_text: string;
  highlight_char_spans: { start: number; end: number }[];
  page_image_b64: string | null;
};
