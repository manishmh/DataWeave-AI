"""
indexing/run_indexing.py
------------------------
Builds (or refreshes) the Qdrant vector index from ETL output.

Usage:
    python -m indexing.run_indexing
    python -m indexing.run_indexing --data-dir /path/to/data
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from etl.pdf_extractor import PageText
from indexing.chunker import chunk_pages
from indexing.vector_store import VectorStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


def run(data_dir: str = "data", pdf_id: str | None = None) -> None:
    data_dir = Path(data_dir)
    chunks_path = data_dir / "chunks.json"

    if not chunks_path.exists():
        raise FileNotFoundError(
            f"ETL output not found at {chunks_path}. Run the ETL pipeline first."
        )

    # -----------------------------------------------------------------------
    # 1. Load cleaned page texts from ETL output
    # -----------------------------------------------------------------------
    logger.info("▶ Loading page chunks from %s", chunks_path)
    raw = json.loads(chunks_path.read_text())
    page_texts = [PageText(page_num=item["page_num"], text=item["text"]) for item in raw]
    logger.info("  Loaded %d pages", len(page_texts))

    # -----------------------------------------------------------------------
    # 2. Chunk into token-bounded segments
    # -----------------------------------------------------------------------
    logger.info("▶ Chunking pages…")
    text_chunks = chunk_pages(page_texts)
    logger.info("  %d chunks generated", len(text_chunks))

    # -----------------------------------------------------------------------
    # 3. Upsert into the vector store (Qdrant — connection from env)
    # -----------------------------------------------------------------------
    store = VectorStore()
    logger.info("▶ Upserting into vector store…  (pdf_id=%s)", pdf_id)
    store.upsert(text_chunks, pdf_id=pdf_id)

    total = store.count()
    logger.info("✔ Indexing complete – %d documents in store", total)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Qdrant vector index")
    parser.add_argument("--data-dir", default="data", help="Directory with ETL output")
    parser.add_argument(
        "--pdf-id",
        default=None,
        help="Tag indexed chunks with this PDF id (enables per-PDF query scoping)",
    )
    args = parser.parse_args()
    run(args.data_dir, pdf_id=args.pdf_id)


if __name__ == "__main__":
    main()
