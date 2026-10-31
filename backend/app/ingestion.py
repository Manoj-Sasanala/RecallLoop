"""PDF ingestion: per-page text, invisible-text stripping, diagram rasterisation.

PyMuPDF only. No model, no network, no disk writes: the raw PDF stays in memory
(PRD risk R7) and only extracted pages reach the database.
"""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass

import pymupdf

from app.verification import normalize

MAX_PAGES = 40
MAX_BYTES = 25 * 1024 * 1024
RENDER_DPI = 150
MIN_INK_DRAWINGS = 8
INVISIBLE_COLOR = 0xFFFFFF


@dataclass(frozen=True)
class ExtractedPage:
    page_number: int
    raw_text: str
    normalized_text: str
    has_visual_diagram: bool
    page_image_b64: str | None
    token_count: int


@dataclass(frozen=True)
class ExtractedDocument:
    filename: str
    sha256_hash: str
    page_count: int
    file_size_bytes: int
    pages: tuple[ExtractedPage, ...]
    diagram_pages: tuple[int, ...]

    @property
    def total_tokens(self) -> int:
        return sum(page.token_count for page in self.pages)


def _visible_text(page: pymupdf.Page) -> str:
    """Text minus invisible layers: zero-size or pure-white spans are prompt-injection bait."""
    chunks: list[str] = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            keep = [
                span["text"]
                for span in line["spans"]
                if span["size"] > 0.5 and span.get("color", 0) != INVISIBLE_COLOR
            ]
            if keep:
                chunks.append("".join(keep))
    return "\n".join(chunks).strip()


def extract_pdf(data: bytes, filename: str) -> ExtractedDocument:
    if not data.startswith(b"%PDF-"):
        raise ValueError("not a PDF (missing %PDF header)")
    if len(data) > MAX_BYTES:
        raise ValueError(f"file exceeds {MAX_BYTES // (1024 * 1024)} MB")

    digest = hashlib.sha256(data).hexdigest()
    try:
        document = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # corrupt or truncated file
        raise ValueError(f"unreadable PDF: {exc}") from exc

    with document:
        if document.needs_pass:
            raise ValueError("PDF is encrypted")
        if document.page_count == 0:
            raise ValueError("PDF has no pages")
        if document.page_count > MAX_PAGES:
            raise ValueError(f"PDF has {document.page_count} pages, limit is {MAX_PAGES}")

        pages: list[ExtractedPage] = []
        for index, page in enumerate(document):
            text = _visible_text(page)
            normalized = normalize(text)
            ink = len(page.get_drawings())
            has_visual = ink >= MIN_INK_DRAWINGS or bool(page.get_images())
            image_b64 = None
            if has_visual:
                pixmap = page.get_pixmap(dpi=RENDER_DPI)
                image_b64 = base64.b64encode(pixmap.tobytes("png")).decode("ascii")
            pages.append(
                ExtractedPage(
                    page_number=index + 1,
                    raw_text=text,
                    normalized_text=normalized,
                    has_visual_diagram=has_visual,
                    page_image_b64=image_b64,
                    token_count=len(normalized.split()),
                )
            )

    if not any(page.normalized_text for page in pages):
        raise ValueError("PDF has no extractable text")

    return ExtractedDocument(
        filename=filename,
        sha256_hash=digest,
        page_count=len(pages),
        file_size_bytes=len(data),
        pages=tuple(pages),
        diagram_pages=tuple(p.page_number for p in pages if p.has_visual_diagram),
    )
