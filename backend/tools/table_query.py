"""
tools/table_query.py
--------------------
LangChain Tool: TableQuery

Loads extracted table JSON files and applies pandas operations.

Input (JSON string):
    {
        "page": 12,              # which page's table to query
        "table_index": 0,        # optional (default 0)
        "filters": {"Region": "South-West"},   # optional dict of col→value filters
        "agg": "sum" | "mean" | "count" | "none"   # aggregation (default "none")
    }

Output: human-readable string with tabular result or computed value.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
from langchain.tools import Tool

_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "tables"


def _load_table(page: int, table_index: int = 0) -> pd.DataFrame:
    fname = f"page_{page}_table_{table_index}.json"
    path = _DATA_DIR / fname
    if not path.exists():
        raise FileNotFoundError(
            f"No table found for page {page}, index {table_index}. "
            f"Available tables: {sorted(p.name for p in _DATA_DIR.glob('*.json'))}"
        )
    payload = json.loads(path.read_text())
    return pd.DataFrame(payload["records"])


def _table_query(input_str: str) -> str:
    """
    Execute a structured query against a parsed table.

    Input example:
        {"page": 12, "filters": {"Region": "South-West"}, "agg": "mean"}
    """
    try:
        params = json.loads(input_str)
    except json.JSONDecodeError as e:
        return f"ERROR: Invalid JSON input – {e}. Expected format: {{\"page\": N, \"filters\": {{...}}, \"agg\": \"sum|mean|count|none\"}}"

    page = params.get("page")
    if page is None:
        return "ERROR: 'page' key is required."

    table_index = params.get("table_index", 0)
    filters: dict = params.get("filters", {})
    agg: str = params.get("agg", "none").lower()

    try:
        df = _load_table(page=int(page), table_index=int(table_index))
    except FileNotFoundError as e:
        return f"ERROR: {e}"

    # Apply filters
    for col, val in filters.items():
        if col not in df.columns:
            available = list(df.columns)
            return f"ERROR: Column '{col}' not found. Available columns: {available}"
        df = df[df[col].astype(str).str.contains(str(val), case=False, na=False)]

    if df.empty:
        return f"No rows matched the filters: {filters}"

    # Apply aggregation
    if agg == "none":
        result_str = df.to_string(index=False)
    elif agg in ("sum", "mean", "count"):
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if not numeric_cols:
            # Try to coerce columns to numeric
            for col in df.columns:
                df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", ""), errors="coerce")
            numeric_cols = df.select_dtypes(include="number").columns.tolist()

        if not numeric_cols:
            return f"No numeric columns found for aggregation. Columns: {list(df.columns)}"

        agg_df = getattr(df[numeric_cols], agg)()
        result_str = agg_df.to_string()
    else:
        return f"ERROR: Unknown aggregation '{agg}'. Use: sum, mean, count, none"

    return (
        f"Table from Page {page} (Table {table_index}), "
        f"filters={filters or 'none'}, agg={agg}:\n\n{result_str}"
    )


table_query_tool = Tool(
    name="TableQuery",
    func=_table_query,
    description=(
        "Query structured tables extracted from the Cyber Ireland 2022 Report. "
        "Input must be a JSON string with keys: "
        "'page' (int, required), "
        "'table_index' (int, optional, default 0), "
        "'filters' (dict of column→value, optional), "
        "'agg' (str: 'sum', 'mean', 'count', or 'none', optional). "
        "Example: {\"page\": 15, \"filters\": {\"Region\": \"South-West\"}, \"agg\": \"mean\"}"
    ),
)


def run_table_query(input_str: str) -> str:
    return _table_query(input_str)
