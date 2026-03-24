"""
etl/pdf_extractor.py
--------------------
Extracts:
  - Plain text per page using pdfplumber
  - Tables per page using camelot (lattice first, stream fallback)

Returns typed dataclasses so downstream modules stay decoupled from
pdfplumber / camelot internals.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import camelot
import pandas as pd
import pdfplumber

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data contracts
# ---------------------------------------------------------------------------

@dataclass
class PageText:
    """Raw text from a single PDF page."""
    page_num: int          # 1-indexed
    text: str


@dataclass
class TableData:
    """A parsed table from a single PDF page."""
    page_num: int          # 1-indexed
    table_index: int       # ordinal within the page (0-based)
    flavor: str            # "lattice" or "stream"
    df: pd.DataFrame = field(repr=False)


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------

def _extract_text(pdf_path: Path) -> List[PageText]:
    """Use pdfplumber to extract text from every page."""
    results: List[PageText] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            raw = page.extract_text() or ""
            results.append(PageText(page_num=page.page_number, text=raw))
    logger.info("Extracted text from %d pages", len(results))
    return results


def _extract_tables_from_page(
    pdf_path: Path,
    page_num: int,       # 1-indexed
) -> List[TableData]:
    """
    Try camelot 'lattice' first (ruled tables).
    If no tables found, fall back to 'stream' (whitespace-delimited).
    """
    tables: List[TableData] = []

    for flavor in ("lattice", "stream"):
        try:
            result = camelot.read_pdf(
                str(pdf_path),
                pages=str(page_num),
                flavor=flavor,
                suppress_stdout=True,
            )
            if len(result) == 0:
                continue

            for idx, table in enumerate(result):
                df = table.df.copy()
                tables.append(
                    TableData(
                        page_num=page_num,
                        table_index=idx,
                        flavor=flavor,
                        df=df,
                    )
                )
            logger.debug(
                "Page %d: %d table(s) via %s", page_num, len(result), flavor
            )
            # Use the first flavor that succeeds
            break

        except Exception as exc:
            logger.debug("Page %d – %s failed: %s", page_num, flavor, exc)
            continue

    return tables


def extract_pdf(pdf_path: str | Path) -> tuple[List[PageText], List[TableData]]:
    """
    Main entry point.

    Returns
    -------
    page_texts : list of PageText
    tables     : list of TableData
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    logger.info("Starting extraction: %s", pdf_path)

    page_texts = _extract_text(pdf_path)

    all_tables: List[TableData] = []
    total_pages = len(page_texts)
    for page_num in range(1, total_pages + 1):
        tables = _extract_tables_from_page(pdf_path, page_num)
        all_tables.extend(tables)

    logger.info(
        "Extraction complete – %d pages, %d tables",
        total_pages,
        len(all_tables),
    )
    return page_texts, all_tables
