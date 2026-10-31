"""Deterministic verification gate between model output and the database.

Every generated item must prove it is source-grounded: its verbatim quote has
to exist in the cited page (or the pages either side of it, for spans across a
page break) and its option set has to be a valid, single-answer 4-option MCQ
without the usual test-wiseness tells. Anything that fails is rejected
individually; one bad item never kills the batch.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Iterable

MIN_QUOTE_MATCH = 0.85
EXPECTED_OPTIONS = 4
LENGTH_TOLERANCE = 0.35
VALID_COGNITIVE_LEVELS = ("RECALL", "APPLICATION", "ANALYSIS")

_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_CODE_FENCE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)


def normalize(text: str) -> str:
    """NFKC + casefold + punctuation to spaces, so quoting differences don't matter."""
    folded = unicodedata.normalize("NFKC", text).casefold()
    return _NON_ALNUM.sub(" ", folded).strip()


def tokens(text: str) -> list[str]:
    normalized = normalize(text)
    return normalized.split() if normalized else []


def longest_common_run(a: list[str], b: list[str]) -> int:
    """Longest contiguous run of tokens shared by both sequences."""
    if not a or not b:
        return 0
    best = 0
    previous = [0] * (len(b) + 1)
    for token_a in a:
        current = [0] * (len(b) + 1)
        for j, token_b in enumerate(b, start=1):
            if token_a == token_b:
                current[j] = previous[j - 1] + 1
                best = max(best, current[j])
        previous = current
    return best


def quote_match_ratio(quote: str, page_text: str) -> float:
    """Share of the quote that appears verbatim (as a contiguous run) in the page."""
    quote_tokens = tokens(quote)
    if not quote_tokens:
        return 0.0
    page_tokens = tokens(page_text)
    if not page_tokens:
        return 0.0
    return round(longest_common_run(quote_tokens, page_tokens) / len(quote_tokens), 4)


def find_quote_span(quote: str, raw_text: str) -> tuple[int, int] | None:
    """Character offsets in raw_text for <mark> highlighting, case/space insensitive.

    shortcut: word-sequence match only; hyphenated line breaks inside a word
    fall back to None and the drawer shows the whole page.
    """
    quote_tokens = tokens(quote)
    if not quote_tokens:
        return None
    pattern = re.compile(r"\W+".join(re.escape(token) for token in quote_tokens), re.IGNORECASE)
    match = pattern.search(raw_text)
    return (match.start(), match.end()) if match else None


@dataclass(frozen=True)
class Verdict:
    ok: bool
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class VerifiedQuestion:
    question_stem: str
    cognitive_level: str
    source_page_number: int
    verbatim_source_quote: str
    quote_match_ratio: float
    options: tuple[dict[str, Any], ...]
    correct_option_id: str
    target_misconception_tested: str | None = None
    topic_code: str | None = None


@dataclass
class VerificationReport:
    accepted: list[VerifiedQuestion] = field(default_factory=list)
    rejected: list[tuple[int, tuple[str, ...], Any]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.accepted)

    @property
    def all_rejected(self) -> bool:
        return not self.accepted


def _grounded_ratio(quote: str, page_number: int, pages: dict[int, str]) -> float:
    """Overlap against the cited page plus its neighbours, joined, so a quote that
    straddles a page break still verifies."""
    window = " ".join(pages[n] for n in (page_number - 1, page_number, page_number + 1) if n in pages)
    return quote_match_ratio(quote, window)


def verify_question(
    item: Any,
    pages: dict[int, str],
    allowed_pages: set[int] | None = None,
    forbidden_stems: set[str] | None = None,
) -> Verdict:
    reasons: list[str] = []

    if not isinstance(item, dict):
        return Verdict(False, ("item is not an object",))

    stem = item.get("question_stem")
    if not isinstance(stem, str) or len(normalize(stem)) < 10:
        reasons.append("question_stem missing or too short")
    elif forbidden_stems and normalize(stem) in forbidden_stems:
        reasons.append("question_stem repeats a previous round")

    level = item.get("cognitive_level")
    if level not in VALID_COGNITIVE_LEVELS:
        reasons.append(f"cognitive_level invalid: {level!r}")

    page_number = item.get("source_page_number")
    if not isinstance(page_number, int) or page_number < 1:
        reasons.append("source_page_number invalid")
    elif page_number not in pages:
        reasons.append(f"page {page_number} not found in document")
    elif allowed_pages is not None and page_number not in allowed_pages:
        reasons.append(f"page {page_number} is outside the topic's page range")

    quote = item.get("verbatim_source_quote")
    if not isinstance(quote, str) or not quote.strip():
        reasons.append("verbatim_source_quote missing")
    elif isinstance(page_number, int) and page_number in pages:
        ratio = _grounded_ratio(quote, page_number, pages)
        if ratio < MIN_QUOTE_MATCH:
            reasons.append(
                f"quote not grounded on page {page_number} (match {ratio:.2f} < {MIN_QUOTE_MATCH})"
            )

    options = item.get("options")
    if not isinstance(options, list) or len(options) != EXPECTED_OPTIONS:
        reasons.append(
            f"expected {EXPECTED_OPTIONS} options, got {len(options) if isinstance(options, list) else 'none'}"
        )
    else:
        ids = [opt.get("option_id") for opt in options if isinstance(opt, dict)]
        if len(ids) != EXPECTED_OPTIONS or len(set(ids)) != EXPECTED_OPTIONS:
            reasons.append("option_id values must be present and unique")
        if not all(
            isinstance(opt.get("text"), str) and opt.get("text", "").strip()
            for opt in options
            if isinstance(opt, dict)
        ):
            reasons.append("every option needs text")
        correct = [opt for opt in options if isinstance(opt, dict) and opt.get("is_correct") is True]
        wrong = [opt for opt in options if isinstance(opt, dict) and opt.get("is_correct") is not True]
        if len(correct) != 1:
            reasons.append(f"expected exactly 1 correct option, got {len(correct)}")
        for opt in wrong:
            if not opt.get("misconception_type"):
                reasons.append(f"distractor {opt.get('option_id')!r} missing misconception_type")
        if len(correct) == 1 and wrong:
            correct_len = len(correct[0].get("text", ""))
            mean_wrong = sum(len(opt.get("text", "")) for opt in wrong) / len(wrong)
            if mean_wrong and abs(correct_len - mean_wrong) > LENGTH_TOLERANCE * mean_wrong:
                reasons.append("correct option length gives the answer away")

    return Verdict(not reasons, tuple(reasons))


def _extract_payload(raw: str) -> Any:
    return extract_json(raw)


def extract_json(raw: str) -> Any:
    text = _CODE_FENCE.sub("", raw).strip()
    start = min((i for i in (text.find("["), text.find("{")) if i >= 0), default=-1)
    if start < 0:
        raise ValueError("no JSON array or object found in model output")
    payload, _ = json.JSONDecoder().raw_decode(text[start:])
    return payload


def parse_and_verify(
    raw_model_output: str,
    pages: dict[int, str],
    expected_count: int | None = None,
    forbidden_stems: set[str] | None = None,
    allowed_pages: set[int] | None = None,
) -> VerificationReport:
    """Tolerate fenced/prose-wrapped JSON, then verify each item on its own."""
    report = VerificationReport()
    try:
        payload = _extract_payload(raw_model_output)
    except (ValueError, json.JSONDecodeError) as exc:
        report.rejected.append((-1, (f"unparseable model output: {exc}",), raw_model_output[:500]))
        return report

    items: Iterable = payload if isinstance(payload, list) else payload.get("questions", [])
    if isinstance(items, dict):
        items = [items]

    for index, item in enumerate(items):
        verdict = verify_question(item, pages, allowed_pages, forbidden_stems)
        if not verdict.ok:
            report.rejected.append((index, verdict.reasons, item))
            continue
        options = tuple(item["options"])
        report.accepted.append(
            VerifiedQuestion(
                question_stem=item["question_stem"].strip(),
                cognitive_level=item["cognitive_level"],
                source_page_number=item["source_page_number"],
                verbatim_source_quote=item["verbatim_source_quote"].strip(),
                quote_match_ratio=_grounded_ratio(
                    item["verbatim_source_quote"], item["source_page_number"], pages
                ),
                options=options,
                correct_option_id=next(o["option_id"] for o in options if o.get("is_correct") is True),
                target_misconception_tested=item.get("target_misconception_tested"),
                topic_code=item.get("topic_code"),
            )
        )

    if expected_count is not None and len(report.accepted) < expected_count:
        report.rejected.append(
            (-2, (f"only {len(report.accepted)}/{expected_count} items passed verification",), None)
        )
    return report
