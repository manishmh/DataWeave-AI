"""
indexing/embedder.py
--------------------
Thin wrapper around sentence-transformers.

Using 'all-MiniLM-L6-v2':
  - 384-dimensional embeddings
  - Fast (CPU-viable for hundreds of chunks)
  - Good semantic quality for short factual passages
"""

from __future__ import annotations

from typing import List

from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"
_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed(texts: List[str]) -> List[List[float]]:
    """
    Returns a list of float vectors, one per input text.
    Downloads the model on first call (cached locally by HuggingFace).
    """
    model = _get_model()
    vectors = model.encode(texts, show_progress_bar=False, convert_to_numpy=True)
    return vectors.tolist()
