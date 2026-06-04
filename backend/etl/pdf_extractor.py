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
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
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

def _extract_text_and_table_pages(
    pdf_path: Path,
) -> tuple[List[PageText], List[int]]:
    """
    Single pdfplumber pass that extracts text from every page AND cheaply
    detects which pages contain table structures.

    Detecting candidate pages here (pdfplumber's geometry-based ``find_tables``
    is fast and runs no subprocess) lets us restrict the *expensive* camelot
    extraction to pages that actually have tables — instead of invoking camelot
    on every page (and falling back lattice→stream on every page), which on a
    several-hundred-page document means well over a thousand full-PDF reparses
    and Ghostscript launches.
    """
    results: List[PageText] = []
    table_pages: List[int] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            raw = page.extract_text() or ""
            results.append(PageText(page_num=page.page_number, text=raw))
            try:
                if page.find_tables():
                    table_pages.append(page.page_number)
            except Exception as exc:  # detection must never abort extraction
                logger.debug("Page %d table-detection failed: %s", page.page_number, exc)
    logger.info(
        "Extracted text from %d pages; %d page(s) have candidate tables",
        len(results),
        len(table_pages),
    )
    return results, table_pages


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

    page_texts, table_pages = _extract_text_and_table_pages(pdf_path)
    total_pages = len(page_texts)

    # Camelot calls are independent and dominated by a Ghostscript subprocess
    # (which releases the GIL), so running candidate pages through a thread pool
    # gives a near-linear speedup. Worker count is capped to keep peak memory
    # sane and is overridable via ETL_TABLE_WORKERS.
    max_workers = min(
        int(os.getenv("ETL_TABLE_WORKERS", "4")),
        max(1, len(table_pages)),
    )

    all_tables: List[TableData] = []
    if table_pages:
        done = 0
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(_extract_tables_from_page, pdf_path, pn): pn
                for pn in table_pages
            }
            for fut in as_completed(futures):
                done += 1
                page_num = futures[fut]
                try:
                    all_tables.extend(fut.result())
                except Exception as exc:
                    logger.warning("Table parse failed on page %d: %s", page_num, exc)
                logger.info("Parsed tables %d/%d candidate pages", done, len(table_pages))
        # Restore deterministic ordering (thread completion order is arbitrary).
        all_tables.sort(key=lambda t: (t.page_num, t.table_index))

    logger.info(
        "Extraction complete – %d pages, %d tables (from %d candidate page(s), %d workers)",
        total_pages,
        len(all_tables),
        len(table_pages),
        max_workers,
    )
    return page_texts, all_tables
