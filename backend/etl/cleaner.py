"""
etl/cleaner.py
--------------
Cleans raw text and normalises table DataFrames produced by the extractor.

Text cleaning strategy
  1. Unicode normalise (NFC) – fixes ligatures, funky hyphens, etc.
  2. Strip running headers / footers (page numbers, report title lines)
  3. Collapse excessive whitespace / blank lines
  4. Remove control characters

Table cleaning strategy
  1. Set first row as header if it looks like a header
  2. Drop fully-empty rows and columns
  3. Forward-fill merged (NaN) cells
  4. Strip whitespace from every cell
"""

from __future__ import annotations

import re
import unicodedata
from typing import List

import pandas as pd

from etl.pdf_extractor import PageText, TableData


# ---------------------------------------------------------------------------
# Text cleaning
# ---------------------------------------------------------------------------

# Patterns that denote running headers/footers in the Cyber Ireland report
_HEADER_FOOTER_PATTERNS: list[re.Pattern] = [
    re.compile(r"^\s*\d+\s*$", re.MULTILINE),           # bare page numbers
    re.compile(r"^cyber\s+ireland.*?report.*?$", re.MULTILINE | re.IGNORECASE),
    re.compile(r"^.*?©\s*\d{4}.*?$", re.MULTILINE),     # copyright lines
]

# Control characters except \n and \t
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]")


def clean_text(page: PageText) -> PageText:
    """Return a new PageText with cleaned text."""
    text = page.text
    if not text:
        return page

    # 1. Unicode NFC
    text = unicodedata.normalize("NFC", text)

    # 2. Remove control characters
    text = _CONTROL_RE.sub("", text)

    # 3. Strip headers / footers
    for pattern in _HEADER_FOOTER_PATTERNS:
        text = pattern.sub("", text)

    # 4. Collapse 3+ consecutive blank lines → double newline
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 5. Strip trailing spaces on each line
    text = "\n".join(line.rstrip() for line in text.splitlines())

    return PageText(page_num=page.page_num, text=text.strip())


def clean_texts(pages: List[PageText]) -> List[PageText]:
    return [clean_text(p) for p in pages]


# ---------------------------------------------------------------------------
# Table cleaning
# ---------------------------------------------------------------------------

def _looks_like_header_row(row: pd.Series) -> bool:
    """Heuristic: a row is a header if most cells are short non-numeric strings."""
    non_empty = [str(c).strip() for c in row if str(c).strip()]
    if not non_empty:
        return False
    numeric_count = sum(1 for c in non_empty if re.match(r"^[\d,.\-\s%]+$", c))
    return numeric_count / len(non_empty) < 0.4


def clean_table(table: TableData) -> TableData:
    """Return a new TableData with a cleaned DataFrame."""
    df = table.df.copy()

    if df.empty:
        return table

    # 1. Strip whitespace from all cells
    df = df.map(lambda x: str(x).strip() if pd.notna(x) else "")

    # 2. Replace empty strings with NaN so dropna works properly
    df.replace("", pd.NA, inplace=True)

    # 3. Promote first row to header if it looks like one
    if _looks_like_header_row(df.iloc[0]):
        df.columns = [str(c).strip() for c in df.iloc[0]]
        df = df.iloc[1:].reset_index(drop=True)

    # 4. Rename still-unnamed columns
    df.columns = [
        col if not str(col).startswith("Unnamed") else f"col_{i}"
        for i, col in enumerate(df.columns)
    ]

    # 5. Drop fully-empty rows and columns
    df.dropna(how="all", inplace=True)
    df.dropna(axis=1, how="all", inplace=True)

    # 6. Forward-fill merged cells (camelot emits NaN for merged cells)
    df.ffill(inplace=True)

    # 7. Reset index
    df.reset_index(drop=True, inplace=True)

    return TableData(
        page_num=table.page_num,
        table_index=table.table_index,
        flavor=table.flavor,
        df=df,
    )


def clean_tables(tables: List[TableData]) -> List[TableData]:
    return [clean_table(t) for t in tables]
