"""
agent/react_agent.py
--------------------
ReAct-style agent using LangChain 0.3.x (create_react_agent + AgentExecutor).
"""

from __future__ import annotations

import logging
import os
import re
import uuid
import warnings
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from langchain.agents import AgentExecutor, create_react_agent
from langchain.prompts import PromptTemplate
from langchain_openai import ChatOpenAI

from agent.logger import parse_intermediate_steps, save_trace
from tools.math_tool import math_tool
from tools.semantic_search import current_pdf_id, semantic_search_tool
from tools.table_query import table_query_tool

logger = logging.getLogger(__name__)

_TOOLS = [semantic_search_tool, table_query_tool, math_tool]

# ---------------------------------------------------------------------------
# LLM – OpenRouter (free models with automatic fallback)
# ---------------------------------------------------------------------------
#
# OpenRouter exposes a number of $0 models (the ":free" suffix). They are fully
# usable but individually flaky — a given free model can be rate-limited (429),
# temporarily de-listed, or overloaded at any moment. So instead of a single
# model we keep an ordered list of free candidates and fall through to the next
# one whenever a call fails. The whole stack therefore stays free out of the
# box, with no code change needed if one model goes down.
#
# Override order:
#   MODEL            – primary model (tried first); may be a paid model if you
#                      have credits and want quality over zero-cost.
#   FALLBACK_MODELS  – comma-separated extras, tried after MODEL.
# The built-in free list is always appended last as a safety net.

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Verified against OpenRouter's live model list (all currently valid IDs).
# Deliberately spread across providers (OpenAI-oss, Meta, Qwen, Z-AI, Google)
# so a single provider being rate-limited (429) doesn't exhaust the chain.
# Free models come and go — refresh this list from:
#   curl https://openrouter.ai/api/v1/models | jq -r '.data[]|select(.pricing.prompt=="0")|.id'
_DEFAULT_FREE_MODELS = [
    "openai/gpt-oss-120b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-next-80b-a3b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "openai/gpt-oss-20b:free",
    "google/gemma-4-31b-it:free",
]


def _candidate_models() -> list[str]:
    """Ordered, de-duplicated list of models to try (primary → fallbacks)."""
    models: list[str] = []
    primary = os.getenv("MODEL", "").strip()
    if primary:
        models.append(primary)
    models += [m.strip() for m in os.getenv("FALLBACK_MODELS", "").split(",") if m.strip()]
    models += _DEFAULT_FREE_MODELS

    seen: set[str] = set()
    ordered: list[str] = []
    for m in models:
        if m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered


def _build_llm(model: str) -> ChatOpenAI:
    api_key = os.getenv("API_KEY") or os.getenv("OPENAI_API_KEY") or ""
    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=OPENROUTER_BASE_URL,
        temperature=0,
        max_tokens=2048,
        timeout=90,
        max_retries=1,  # fail fast so we can fall through to the next model
    )


# ---------------------------------------------------------------------------
# Prompt – inlined ReAct template (no langchainhub dependency)
# ---------------------------------------------------------------------------

_REACT_TEMPLATE = """Answer the following questions as best you can. You have access to the following tools:

{tools}

Use EXACTLY this format. Output plain text only — no markdown, no bold, no headings:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question. Always cite page numbers like [Page N] for every fact.

Critical rules:
- NEVER write an "Observation:" line yourself — the system fills it in after each Action. Stop after "Action Input:" and wait.
- Base every fact ONLY on the text returned in Observations. Do not use outside knowledge and do not invent passages, numbers, or page citations.
- If the Observations do not contain the answer, your Final Answer must say the document does not contain that information.

Begin!

Question: {input}
Thought:{agent_scratchpad}"""

_PROMPT = PromptTemplate.from_template(_REACT_TEMPLATE)


# ---------------------------------------------------------------------------
# Citation extraction
# ---------------------------------------------------------------------------

def _extract_citations(steps: list) -> list[dict]:
    citations: list[dict] = []
    seen: set[int] = set()
    for action, observation in steps:
        for match in re.finditer(r"\[Page (\d+)\]([^\[]*)", str(observation)):
            page_num = int(match.group(1))
            snippet = match.group(2).strip()[:300]
            if page_num not in seen:
                seen.add(page_num)
                citations.append({"page": page_num, "text": snippet})
    return sorted(citations, key=lambda c: c["page"])


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_query(query: str, pdf_id: str | None = None) -> dict[str, Any]:
    """
    Run the ReAct agent on a user query.

    If `pdf_id` is given, SemanticSearch is scoped to that document so the
    answer is drawn only from the selected PDF; otherwise it spans the corpus.

    Returns: {"answer": str, "citations": [...], "trace": [...]}
    """
    request_id = str(uuid.uuid4())
    logger.info("[%s] query: %s  pdf_id=%s", request_id, query, pdf_id)

    # Scope retrieval to this PDF for the duration of the request. The tool
    # reads this context var (see tools/semantic_search.py).
    scope_token = current_pdf_id.set(pdf_id)
    try:
        return _run_with_fallback(request_id, query)
    finally:
        current_pdf_id.reset(scope_token)


def _run_with_fallback(request_id: str, query: str) -> dict[str, Any]:
    # Try each candidate model in order; fall through to the next one if a
    # model errors (rate-limited, de-listed, overloaded, auth issue, …).
    response: dict | None = None
    last_error: Exception | None = None
    for model in _candidate_models():
        agent = create_react_agent(llm=_build_llm(model), tools=_TOOLS, prompt=_PROMPT)
        executor = AgentExecutor(
            agent=agent,
            tools=_TOOLS,
            verbose=True,
            max_iterations=8,
            return_intermediate_steps=True,
            handle_parsing_errors=True,
        )
        try:
            logger.info("[%s] invoking model: %s", request_id, model)
            response = executor.invoke({"input": query})
            logger.info("[%s] model %s succeeded", request_id, model)
            break
        except Exception as exc:
            last_error = exc
            logger.warning("[%s] model %s failed (%s); trying next", request_id, model, exc)
            continue

    if response is None:
        logger.error("[%s] all models failed; last error: %s", request_id, last_error)
        return {
            "answer": f"All language models are currently unavailable. Last error: {last_error}",
            "citations": [],
            "trace": [],
        }

    answer: str = response.get("output", "")
    steps: list = response.get("intermediate_steps", [])

    citations = _extract_citations(steps)
    parsed_steps = parse_intermediate_steps(steps)
    save_trace(request_id=request_id, query=query, steps=steps, answer=answer)

    return {"answer": answer, "citations": citations, "trace": parsed_steps}
