"""
indexing/storage_guard.py
-------------------------
Memory safety valve for the free-tier Qdrant Cloud cluster (1 GB RAM).

Qdrant exposes live memory via its Prometheus ``/metrics`` endpoint. The most
useful gauge is ``memory_resident_bytes`` (RSS of physically-resident data the
engine holds) — it grows with the number of stored vectors. The cluster *pod*
limit (the "X MB out of 1 GB" the dashboard shows) also includes a roughly
constant runtime/OS baseline that the in-app gauge does not capture, so we
model:

    estimated_pod_mb ≈ QDRANT_BASELINE_MB + resident_mb

When ``estimated_pod_mb`` crosses the high-water mark we evict whole PDFs,
oldest-first (LRU by ``uploaded_at`` in data/pdfs.json), until we're back under
the low-water mark — never evicting the most recent upload.

Config (all optional; see .env.example):
    QDRANT_GUARD_ENABLED   default "true"
    QDRANT_MEM_HIGH_MB     default 900   (start evicting at/above this)
    QDRANT_MEM_LOW_MB      default 700   (evict down to this)
    QDRANT_BASELINE_MB     default 110   (constant pod overhead estimate)

Note: Qdrant reclaims RAM from deleted points asynchronously (on segment
optimization), so resident memory may not drop the instant a PDF is evicted.
To avoid over-eviction from that lag we don't re-poll RAM in the loop; instead
we estimate each PDF's share from the current avg bytes/point and stop once the
estimated freed amount covers the overage.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
from pathlib import Path
from typing import Optional

from indexing.vector_store import VectorStore

logger = logging.getLogger(__name__)

_MIB = 1024 * 1024
PDFS_META_FILE = Path(__file__).resolve().parent.parent / "data" / "pdfs.json"


# ---------------------------------------------------------------------------
# Metadata helpers (data/pdfs.json — same file the API writes)
# ---------------------------------------------------------------------------

def _load_meta() -> list[dict]:
    if PDFS_META_FILE.exists():
        return json.loads(PDFS_META_FILE.read_text())
    return []


def _save_meta(meta: list[dict]) -> None:
    PDFS_META_FILE.write_text(json.dumps(meta, indent=2))


# ---------------------------------------------------------------------------
# Memory measurement
# ---------------------------------------------------------------------------

def _resident_bytes() -> Optional[float]:
    """Read memory_resident_bytes from Qdrant's /metrics. None if unavailable."""
    url = os.getenv("QDRANT_URL")
    if not url or url == ":memory:":
        return None
    api_key = os.getenv("QDRANT_API_KEY") or ""
    req = urllib.request.Request(
        url.rstrip("/") + "/metrics",
        headers={"api-key": api_key},
    )
    try:
        text = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
    except Exception as exc:
        logger.warning("storage_guard: could not read /metrics: %s", exc)
        return None
    for line in text.splitlines():
        if line.startswith("memory_resident_bytes"):
            try:
                return float(line.split()[1])
            except (IndexError, ValueError):
                return None
    return None


def memory_report() -> dict:
    """Current memory picture (all MiB)."""
    baseline_mb = float(os.getenv("QDRANT_BASELINE_MB", "110"))
    resident = _resident_bytes()
    resident_mb = (resident / _MIB) if resident is not None else 0.0
    return {
        "available": resident is not None,
        "resident_mb": round(resident_mb, 1),
        "baseline_mb": baseline_mb,
        "estimated_pod_mb": round(baseline_mb + resident_mb, 1),
        "limit_mb": 1024.0,
    }


# ---------------------------------------------------------------------------
# Enforcement
# ---------------------------------------------------------------------------

def enforce_memory_budget(
    high_mb: float | None = None,
    low_mb: float | None = None,
) -> dict:
    """
    Evict oldest PDFs if estimated pod memory is at/above the high-water mark.

    Returns a report dict: {action, evicted: [...], freed_mb, ...memory_report}.
    Safe no-op if the guard is disabled, metrics are unavailable, or memory is
    under budget.
    """
    if os.getenv("QDRANT_GUARD_ENABLED", "true").lower() in ("0", "false", "no"):
        return {"action": "disabled"}

    high = high_mb if high_mb is not None else float(os.getenv("QDRANT_MEM_HIGH_MB", "900"))
    low = low_mb if low_mb is not None else float(os.getenv("QDRANT_MEM_LOW_MB", "700"))

    rep = memory_report()
    if not rep["available"]:
        return {"action": "no_metrics", **rep}

    pod = rep["estimated_pod_mb"]
    if pod < high:
        return {"action": "ok", "evicted": [], **rep}

    logger.warning(
        "storage_guard: estimated pod memory %.1f MiB >= high-water %.0f MiB — evicting oldest PDFs",
        pod, high,
    )

    store = VectorStore()
    total_points = max(store.count(), 1)
    avg_bytes_per_point = (rep["resident_mb"] * _MIB) / total_points
    need_bytes = (pod - low) * _MIB

    meta = _load_meta()
    # Oldest first; entries without uploaded_at sort first (treated as oldest).
    meta_sorted = sorted(meta, key=lambda m: m.get("uploaded_at", ""))

    evicted: list[dict] = []
    freed_bytes = 0.0
    for entry in meta_sorted:
        if freed_bytes >= need_bytes:
            break
        # Always keep at least the newest PDF.
        if len(meta) - len(evicted) <= 1:
            break
        pdf_id = entry.get("id")
        if not pdf_id:
            continue
        pts = store.count_pdf(pdf_id)
        store.delete_pdf(pdf_id)
        freed_bytes += pts * avg_bytes_per_point
        evicted.append(entry)
        logger.warning(
            "storage_guard: evicted PDF %r (%s) — %d points, ~%.1f MiB",
            entry.get("name"), pdf_id, pts, (pts * avg_bytes_per_point) / _MIB,
        )

    if evicted:
        evicted_ids = {e["id"] for e in evicted}
        _save_meta([m for m in meta if m.get("id") not in evicted_ids])

    return {
        "action": "evicted" if evicted else "over_budget_nothing_evictable",
        "evicted": [{"id": e.get("id"), "name": e.get("name")} for e in evicted],
        "freed_mb": round(freed_bytes / _MIB, 1),
        **rep,
    }


def main() -> None:  # manual run: python -m indexing.storage_guard
    import argparse

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    parser = argparse.ArgumentParser(description="Qdrant memory guard")
    parser.add_argument("--report", action="store_true", help="Only print the memory report")
    parser.add_argument("--high", type=float, default=None)
    parser.add_argument("--low", type=float, default=None)
    args = parser.parse_args()

    if args.report:
        print(json.dumps(memory_report(), indent=2))
    else:
        print(json.dumps(enforce_memory_budget(args.high, args.low), indent=2))


if __name__ == "__main__":
    main()
