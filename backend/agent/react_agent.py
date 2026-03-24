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
from tools.semantic_search import semantic_search_tool
from tools.table_query import table_query_tool

logger = logging.getLogger(__name__)

_TOOLS = [semantic_search_tool, table_query_tool, math_tool]

# ---------------------------------------------------------------------------
# LLM – OpenRouter-compatible endpoint
# ---------------------------------------------------------------------------

_LLM: ChatOpenAI | None = None


def _get_llm() -> ChatOpenAI:
    global _LLM
    if _LLM is None:
        api_key = os.getenv("API_KEY") or os.getenv("OPENAI_API_KEY") or ""
        model = os.getenv("MODEL", "openai/gpt-4o-mini")
        _LLM = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=0,
            max_tokens=2048,
        )
        logger.info("LLM initialised: %s via OpenRouter", model)
    return _LLM


# ---------------------------------------------------------------------------
# Prompt – inlined ReAct template (no langchainhub dependency)
# ---------------------------------------------------------------------------

_REACT_TEMPLATE = """Answer the following questions as best you can. You have access to the following tools:

{tools}

Use the following format:

Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question. Always cite page numbers like [Page N] for every fact.

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

def run_query(query: str) -> dict[str, Any]:
    """
    Run the ReAct agent on a user query.

    Returns: {"answer": str, "citations": [...], "trace": [...]}
    """
    request_id = str(uuid.uuid4())
    logger.info("[%s] query: %s", request_id, query)

    agent = create_react_agent(llm=_get_llm(), tools=_TOOLS, prompt=_PROMPT)
    executor = AgentExecutor(
        agent=agent,
        tools=_TOOLS,
        verbose=True,
        max_iterations=8,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
    )

    try:
        response = executor.invoke({"input": query})
    except Exception as exc:
        logger.error("[%s] Agent error: %s", request_id, exc)
        return {"answer": f"Agent error: {exc}", "citations": [], "trace": []}

    answer: str = response.get("output", "")
    steps: list = response.get("intermediate_steps", [])

    citations = _extract_citations(steps)
    parsed_steps = parse_intermediate_steps(steps)
    save_trace(request_id=request_id, query=query, steps=steps, answer=answer)

    return {"answer": answer, "citations": citations, "trace": parsed_steps}
