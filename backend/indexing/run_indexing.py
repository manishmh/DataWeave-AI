"""
indexing/run_indexing.py
------------------------
Builds (or refreshes) the Chroma vector index from ETL output.

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


def run(data_dir: str = "data") -> None:
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
    # 3. Upsert into Chroma
    # -----------------------------------------------------------------------
    store = VectorStore(db_path=data_dir / "chroma_db")
    logger.info("▶ Upserting into vector store…")
    store.upsert(text_chunks)

    total = store.count()
    logger.info("✔ Indexing complete – %d documents in store", total)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the Chroma vector index")
    parser.add_argument("--data-dir", default="data", help="Directory with ETL output")
    args = parser.parse_args()
    run(args.data_dir)


if __name__ == "__main__":
    main()
