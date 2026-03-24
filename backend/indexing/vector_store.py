"""
indexing/vector_store.py
------------------------
ChromaDB wrapper providing upsert and query operations.

Collection schema per document
  id       : "{page_num}_{chunk_index}"
  embedding: float vector from embedder
  document : chunk text
  metadata : {"page_num": int, "chunk_index": int}
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

import chromadb
from chromadb.config import Settings

from indexing.chunker import TextChunk
from indexing.embedder import embed

logger = logging.getLogger(__name__)

COLLECTION_NAME = "cyber_ireland_2022"
_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "chroma_db"


class VectorStore:
    def __init__(self, db_path: str | Path | None = None) -> None:
        path = str(db_path or _DEFAULT_DB_PATH)
        Path(path).mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(
            path=path,
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("VectorStore ready at %s  (collection=%s)", path, COLLECTION_NAME)

    # ------------------------------------------------------------------
    def upsert(self, chunks: List[TextChunk]) -> None:
        if not chunks:
            return

        ids = [f"{c.page_num}_{c.chunk_index}" for c in chunks]
        texts = [c.text for c in chunks]
        metadatas = [{"page_num": c.page_num, "chunk_index": c.chunk_index} for c in chunks]

        logger.info("Generating embeddings for %d chunks…", len(chunks))
        embeddings = embed(texts)

        # Upsert in batches of 500 to avoid Chroma memory spikes
        batch_size = 500
        for start in range(0, len(chunks), batch_size):
            end = start + batch_size
            self._collection.upsert(
                ids=ids[start:end],
                embeddings=embeddings[start:end],
                documents=texts[start:end],
                metadatas=metadatas[start:end],
            )
            logger.debug("  upserted batch %d–%d", start, min(end, len(chunks)))

        logger.info("✔ Upserted %d chunks into Chroma", len(chunks))

    # ------------------------------------------------------------------
    def query(self, query_text: str, k: int = 5) -> List[dict]:
        """
        Returns top-k results as list of dicts:
            {"text": str, "page_num": int, "chunk_index": int, "distance": float}
        """
        q_embedding = embed([query_text])[0]
        results = self._collection.query(
            query_embeddings=[q_embedding],
            n_results=k,
            include=["documents", "metadatas", "distances"],
        )

        docs = results["documents"][0]
        metas = results["metadatas"][0]
        dists = results["distances"][0]

        return [
            {
                "text": doc,
                "page_num": meta["page_num"],
                "chunk_index": meta["chunk_index"],
                "distance": dist,
            }
            for doc, meta, dist in zip(docs, metas, dists)
        ]

    # ------------------------------------------------------------------
    def count(self) -> int:
        return self._collection.count()
