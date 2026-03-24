"""
indexing/chunker.py
-------------------
Splits page text into overlapping token-bounded chunks.

Strategy
  - Use tiktoken (cl100k_base) for token counting
  - Sliding window: CHUNK_TOKENS=400, OVERLAP_TOKENS=50
  - Each chunk preserves its source page_num

This keeps chunks semantically meaningful while giving the vector search
enough granularity to retrieve a precise paragraph.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import tiktoken

from etl.pdf_extractor import PageText

CHUNK_TOKENS: int = 400
OVERLAP_TOKENS: int = 50

_ENCODER = tiktoken.get_encoding("cl100k_base")


@dataclass
class TextChunk:
    page_num: int
    chunk_index: int    # ordinal within the page (0-based)
    text: str


def _split_page(page: PageText) -> List[TextChunk]:
    """Split a single page into overlapping chunks."""
    tokens = _ENCODER.encode(page.text)
    if not tokens:
        return []

    chunks: List[TextChunk] = []
    step = CHUNK_TOKENS - OVERLAP_TOKENS
    idx = 0

    for chunk_i, start in enumerate(range(0, len(tokens), step)):
        end = start + CHUNK_TOKENS
        chunk_tokens = tokens[start:end]
        chunk_text = _ENCODER.decode(chunk_tokens).strip()

        if chunk_text:
            chunks.append(
                TextChunk(
                    page_num=page.page_num,
                    chunk_index=chunk_i,
                    text=chunk_text,
                )
            )

        if end >= len(tokens):
            break

    return chunks


def chunk_pages(pages: List[PageText]) -> List[TextChunk]:
    """Chunk all pages."""
    all_chunks: List[TextChunk] = []
    for page in pages:
        all_chunks.extend(_split_page(page))
    return all_chunks
