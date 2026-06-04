"""
indexing/vector_store.py
------------------------
Qdrant-backed vector store providing upsert / query / count operations.

Why Qdrant (not embedded Chroma)?
  On free hosting the container filesystem is ephemeral — it is wiped on every
  redeploy/restart/scale-to-zero. An embedded on-disk index would vanish with
  it. Qdrant Cloud lives *outside* the backend's lifecycle, so the API process
  stays stateless and the index survives restarts.

Connection is chosen from the environment (see .env.example):
  * QDRANT_URL set      → remote cluster (Qdrant Cloud) using QDRANT_API_KEY
  * QDRANT_URL=":memory:" → in-process ephemeral store (used by tests)
  * QDRANT_URL unset    → local on-disk store at data/qdrant_local
                          (offline dev; NOT for production)

Point schema
  id      : deterministic UUIDv5 of "{pdf_id}:{page_num}:{chunk_index}" so
            chunks from different PDFs never collide (re-upsert of the same
            PDF overwrites instead of duplicating)
  vector  : 384-d embedding from indexing.embedder (all-MiniLM-L6-v2)
  payload : {"text": str, "page_num": int, "chunk_index": int, "pdf_id": str}

Per-PDF scoping: chunks are tagged with their source ``pdf_id`` at index time,
and ``query(..., pdf_id=...)`` filters on it so chat answers are restricted to
the selected document instead of spanning the whole corpus.
"""

from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import List

from qdrant_client import QdrantClient, models

from indexing.chunker import TextChunk
from indexing.embedder import embed

logger = logging.getLogger(__name__)

# Collection + vector config. Dimension must match the embedder
# (all-MiniLM-L6-v2 → 384). Cosine distance matches the old Chroma setup.
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "pdf_chunks")
_EMBED_DIM = 384
_DISTANCE = models.Distance.COSINE

# Stable namespace so "{page}_{chunk}" always maps to the same point id.
_ID_NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")

_DEFAULT_LOCAL_PATH = Path(__file__).resolve().parent.parent / "data" / "qdrant_local"


def _point_id(page_num: int, chunk_index: int, pdf_id: str | None = None) -> str:
    seed = f"{pdf_id}:{page_num}:{chunk_index}" if pdf_id else f"{page_num}_{chunk_index}"
    return str(uuid.uuid5(_ID_NAMESPACE, seed))


class VectorStore:
    def __init__(self, location: str | None = None) -> None:
        """
        Connect to Qdrant. `location` overrides env detection (used by tests,
        e.g. ":memory:"). Production passes nothing and relies on QDRANT_URL.
        """
        url = location or os.getenv("QDRANT_URL")
        api_key = os.getenv("QDRANT_API_KEY")

        if url == ":memory:":
            self._client = QdrantClient(location=":memory:")
            logger.info("VectorStore: in-memory Qdrant (ephemeral)")
        elif url:
            self._client = QdrantClient(
                url=url,
                api_key=api_key or None,
                timeout=60,
            )
            logger.info("VectorStore: remote Qdrant at %s", url)
        else:
            path = os.getenv("QDRANT_PATH") or str(_DEFAULT_LOCAL_PATH)
            Path(path).mkdir(parents=True, exist_ok=True)
            self._client = QdrantClient(path=path)
            logger.info("VectorStore: local on-disk Qdrant at %s", path)

        self._ensure_collection()
        logger.info("VectorStore ready (collection=%s)", COLLECTION_NAME)

    # ------------------------------------------------------------------
    def _ensure_collection(self) -> None:
        if not self._client.collection_exists(COLLECTION_NAME):
            self._client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=models.VectorParams(
                    size=_EMBED_DIM,
                    distance=_DISTANCE,
                ),
            )
            logger.info("Created Qdrant collection %s (dim=%d)", COLLECTION_NAME, _EMBED_DIM)

        # Keyword index on pdf_id so per-PDF filtering is fast. Idempotent —
        # ignore the error if the index already exists.
        try:
            self._client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name="pdf_id",
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
        except Exception as exc:  # already exists / race — safe to ignore
            logger.debug("pdf_id payload index not (re)created: %s", exc)

    # ------------------------------------------------------------------
    def upsert(self, chunks: List[TextChunk], pdf_id: str | None = None) -> None:
        if not chunks:
            return

        texts = [c.text for c in chunks]
        logger.info("Generating embeddings for %d chunks…", len(chunks))
        embeddings = embed(texts)

        points = [
            models.PointStruct(
                id=_point_id(c.page_num, c.chunk_index, pdf_id),
                vector=emb,
                payload={
                    "text": c.text,
                    "page_num": c.page_num,
                    "chunk_index": c.chunk_index,
                    "pdf_id": pdf_id,
                },
            )
            for c, emb in zip(chunks, embeddings)
        ]

        # Upsert in batches to keep request payloads modest over the network.
        batch_size = 256
        for start in range(0, len(points), batch_size):
            batch = points[start:start + batch_size]
            self._client.upsert(collection_name=COLLECTION_NAME, points=batch, wait=True)
            logger.debug("  upserted batch %d–%d", start, start + len(batch))

        logger.info("✔ Upserted %d chunks into Qdrant", len(chunks))

    # ------------------------------------------------------------------
    def query(self, query_text: str, k: int = 5, pdf_id: str | None = None) -> List[dict]:
        """
        Returns top-k results as list of dicts:
            {"text": str, "page_num": int, "chunk_index": int, "distance": float}

        `distance` is 1 - cosine_similarity, so smaller = closer (matching the
        semantics the old Chroma wrapper exposed).

        If `pdf_id` is given, results are restricted to chunks from that PDF;
        otherwise the search spans the whole collection (backward compatible).
        """
        q_embedding = embed([query_text])[0]
        query_filter = None
        if pdf_id:
            query_filter = models.Filter(
                must=[
                    models.FieldCondition(
                        key="pdf_id",
                        match=models.MatchValue(value=pdf_id),
                    )
                ]
            )
        response = self._client.query_points(
            collection_name=COLLECTION_NAME,
            query=q_embedding,
            limit=k,
            with_payload=True,
            query_filter=query_filter,
        )

        results: List[dict] = []
        for hit in response.points:
            payload = hit.payload or {}
            results.append(
                {
                    "text": payload.get("text", ""),
                    "page_num": payload.get("page_num"),
                    "chunk_index": payload.get("chunk_index"),
                    "distance": 1.0 - hit.score,
                }
            )
        return results

    # ------------------------------------------------------------------
    def count(self) -> int:
        return self._client.count(collection_name=COLLECTION_NAME, exact=True).count

    # ------------------------------------------------------------------
    def count_pdf(self, pdf_id: str) -> int:
        """Number of points belonging to a single PDF."""
        return self._client.count(
            collection_name=COLLECTION_NAME,
            count_filter=models.Filter(
                must=[models.FieldCondition(key="pdf_id", match=models.MatchValue(value=pdf_id))]
            ),
            exact=True,
        ).count

    # ------------------------------------------------------------------
    def delete_pdf(self, pdf_id: str) -> None:
        """Delete every point belonging to a PDF (used by the storage guard)."""
        self._client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[models.FieldCondition(key="pdf_id", match=models.MatchValue(value=pdf_id))]
                )
            ),
            wait=True,
        )
        logger.info("Deleted all points for pdf_id=%s", pdf_id)
