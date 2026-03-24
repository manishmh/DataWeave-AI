"""
tools/semantic_search.py
------------------------
LangChain Tool: SemanticSearch

Wraps VectorStore.query() and formats results as a citation-rich string
that the ReAct agent can read and parse.

Input:  plain-text query string
Output: formatted string with top-k results, each prefixed [Page N]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from langchain.tools import Tool

from indexing.vector_store import VectorStore

_store: VectorStore | None = None


def _get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store


def _search(query: str) -> str:
    """
    Queries the vector store and returns formatted results.

    Each result line is:
        [Page N] <chunk text>

    The agent uses page numbers as citations.
    """
    if not query.strip():
        return "ERROR: empty query provided."

    results = _get_store().query(query_text=query, k=5)

    if not results:
        return "No relevant content found. Try rephrasing the query."

    parts: list[str] = []
    for i, r in enumerate(results, start=1):
        page = r["page_num"]
        text = r["text"].replace("\n", " ").strip()
        parts.append(f"[Page {page}] {text}")

    return "\n\n".join(parts)


# Expose as a LangChain Tool
semantic_search_tool = Tool(
    name="SemanticSearch",
    func=_search,
    description=(
        "Search the Cyber Ireland 2022 Report for relevant information. "
        "Provide a natural-language question or keyword phrase. "
        "Returns the most relevant passages, each prefixed with [Page N] "
        "for citation purposes. Use this tool FIRST for any factual query."
    ),
)


# Convenience function for standalone testing
def run_search(query: str) -> str:
    return _search(query)
