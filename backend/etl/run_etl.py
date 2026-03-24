"""
etl/run_etl.py
--------------
Orchestrator – run with:
    python -m etl.run_etl --pdf data/cyber_ireland_2022.pdf

Outputs
-------
data/chunks.json          – list of {page_num, text}
data/tables/page_N_T.json – per-table JSON (records orientation)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Add project root to path so sibling packages resolve correctly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from etl.cleaner import clean_tables, clean_texts
from etl.pdf_extractor import extract_pdf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)


def run(pdf_path: str, data_dir: str = "data") -> None:
    data_dir = Path(data_dir)
    tables_dir = data_dir / "tables"
    tables_dir.mkdir(parents=True, exist_ok=True)

    # -----------------------------------------------------------------------
    # 1. Extract
    # -----------------------------------------------------------------------
    logger.info("▶ Extracting PDF: %s", pdf_path)
    page_texts, raw_tables = extract_pdf(pdf_path)

    # -----------------------------------------------------------------------
    # 2. Clean
    # -----------------------------------------------------------------------
    logger.info("▶ Cleaning text (%d pages)", len(page_texts))
    clean_pages = clean_texts(page_texts)

    logger.info("▶ Cleaning tables (%d found)", len(raw_tables))
    clean_tbl = clean_tables(raw_tables)

    # -----------------------------------------------------------------------
    # 3. Persist text chunks
    # -----------------------------------------------------------------------
    chunks = [
        {"page_num": p.page_num, "text": p.text}
        for p in clean_pages
        if p.text.strip()
    ]
    chunks_path = data_dir / "chunks.json"
    chunks_path.write_text(json.dumps(chunks, ensure_ascii=False, indent=2))
    logger.info("✔ Saved %d page chunks → %s", len(chunks), chunks_path)

    # -----------------------------------------------------------------------
    # 4. Persist tables
    # -----------------------------------------------------------------------
    saved_tables = 0
    for tbl in clean_tbl:
        if tbl.df.empty:
            continue
        fname = f"page_{tbl.page_num}_table_{tbl.table_index}.json"
        out_path = tables_dir / fname
        table_payload = {
            "page_num": tbl.page_num,
            "table_index": tbl.table_index,
            "flavor": tbl.flavor,
            "columns": list(tbl.df.columns),
            "records": tbl.df.to_dict(orient="records"),
        }
        out_path.write_text(
            json.dumps(table_payload, ensure_ascii=False, indent=2)
        )
        saved_tables += 1

    logger.info("✔ Saved %d tables → %s/", saved_tables, tables_dir)
    logger.info("ETL complete ✅")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ETL pipeline on a PDF file")
    parser.add_argument(
        "--pdf",
        required=True,
        help="Path to the source PDF file",
    )
    parser.add_argument(
        "--data-dir",
        default="data",
        help="Output directory for chunks and tables (default: data/)",
    )
    args = parser.parse_args()
    run(args.pdf, args.data_dir)


if __name__ == "__main__":
    main()
