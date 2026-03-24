"""
agent/logger.py
---------------
Structured JSON logger for agent reasoning traces.

Each invocation writes a JSON file to logs/<request_id>.json containing:
  {
    "request_id": "...",
    "query":      "...",
    "tool_calls": ["SemanticSearch", ...],
    "steps": [
      {"step": 1, "thought": "...", "action": "SemanticSearch", "action_input": "...", "observation": "..."},
      ...
    ],
    "answer": "...",
    "timestamp": "2024-..."
  }
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOGS_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOGS_DIR.mkdir(exist_ok=True)

logger = logging.getLogger(__name__)


def parse_intermediate_steps(steps: list) -> list[dict]:
    """
    Convert LangChain's intermediate_steps into clean structured dicts.

    LangChain returns: [(AgentAction, observation_str), ...]
    AgentAction has: .tool, .tool_input, .log (which contains Thought+Action)
    """
    parsed = []
    for i, (action, observation) in enumerate(steps, start=1):
        log_text: str = getattr(action, "log", "") or ""
        # Extract thought from log (everything before "Action:")
        thought = ""
        if "Action:" in log_text:
            thought = log_text.split("Action:")[0].replace("Thought:", "").strip()
        else:
            thought = log_text.strip()

        parsed.append(
            {
                "step": i,
                "thought": thought,
                "action": getattr(action, "tool", ""),
                "action_input": str(getattr(action, "tool_input", "")),
                "observation": str(observation),
            }
        )
    return parsed


def save_trace(
    request_id: str,
    query: str,
    steps: list,
    answer: str,
    extra: dict[str, Any] | None = None,
) -> Path:
    """
    Persist the full reasoning trace for a request.

    Returns the path to the written file.
    """
    parsed_steps = parse_intermediate_steps(steps)
    tool_calls = [s["action"] for s in parsed_steps if s["action"]]

    payload = {
        "request_id": request_id,
        "query": query,
        "tool_calls": tool_calls,
        "steps": parsed_steps,
        "answer": answer,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    }
    if extra:
        payload.update(extra)

    out_path = _LOGS_DIR / f"{request_id}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    logger.info("Trace saved → %s", out_path)
    return out_path
