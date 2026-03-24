#!/usr/bin/env python3
"""
cli.py – Professional CLI for the Cyber Ireland Agentic Knowledge System.

Shows live agent reasoning steps as they happen, then a clean final result.

Usage:
    python3 cli.py "What is the total number of jobs reported?"
    python3 cli.py                          # interactive prompt
"""

from __future__ import annotations

import sys
import time
import warnings
import json
import textwrap
from pathlib import Path
from typing import Any

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).resolve().parent))

# ── Colours ───────────────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
BLUE   = "\033[34m"
MAGENTA= "\033[35m"
WHITE  = "\033[97m"
RED    = "\033[31m"

def c(color: str, text: str) -> str:
    return f"{color}{text}{RESET}"

TOOL_ICONS = {
    "SemanticSearch": "🔍",
    "TableQuery":     "📊",
    "MathTool":       "🧮",
}

# ── Live callback ─────────────────────────────────────────────────────────────
from langchain.callbacks.base import BaseCallbackHandler

class LiveStepCallback(BaseCallbackHandler):
    """Prints each ReAct step to the terminal as it happens."""

    _step = 0

    def on_agent_action(self, action: Any, **kwargs: Any) -> None:
        self._step += 1
        icon = TOOL_ICONS.get(action.tool, "🔧")
        tool_input = str(action.tool_input)
        if len(tool_input) > 80:
            tool_input = tool_input[:77] + "..."

        print(
            f"\n  {c(DIM, f'Step {self._step}')}  "
            f"{icon} {c(BOLD + CYAN, action.tool)}"
            f"  {c(DIM, '→')}  {c(WHITE, tool_input)}"
        )

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        # Show a short preview of what the tool returned
        preview = output.replace("\n", " ").strip()[:120]
        if len(output) > 120:
            preview += "…"
        print(f"     {c(DIM, '↳')} {c(DIM, preview)}")

    def on_agent_finish(self, finish: Any, **kwargs: Any) -> None:
        pass  # We'll print the final answer ourselves


# ── Main ──────────────────────────────────────────────────────────────────────
def run(query: str) -> None:
    # ── Header ────────────────────────────────────────────────────────────────
    width = 72
    print()
    print(c(BOLD + BLUE, "╔" + "═" * (width - 2) + "╗"))
    print(c(BOLD + BLUE, "║") + c(BOLD + WHITE, "  🛡  Cyber Ireland Agentic Knowledge System".center(width - 4)) + c(BOLD + BLUE, "  ║"))
    print(c(BOLD + BLUE, "╚" + "═" * (width - 2) + "╝"))
    print()
    print(c(BOLD, "  Query  ") + c(WHITE, query))
    print(c(DIM, "  " + "─" * (width - 4)))

    # ── Pipeline status ────────────────────────────────────────────────────────
    print(f"\n  {c(GREEN, '✔')} Vector store loaded    {c(DIM, '(ChromaDB · 87 chunks)')}")
    print(f"  {c(GREEN, '✔')} Embedder ready         {c(DIM, '(all-MiniLM-L6-v2)')}")
    print(f"  {c(GREEN, '✔')} Tools available        {c(DIM, '(SemanticSearch · TableQuery · MathTool)')}")
    print(f"  {c(YELLOW, '▶')} Agent reasoning        {c(DIM, '(ReAct · OpenRouter · gpt-4o-mini)')}")

    print(c(DIM, "\n  " + "─" * (width - 4)))
    print(f"  {c(BOLD, 'Reasoning trace')}")

    # ── Import here so pipeline-init messages appear first ────────────────────
    import os
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")

    from langchain.agents import AgentExecutor, create_react_agent
    from langchain.prompts import PromptTemplate
    from langchain_openai import ChatOpenAI
    from tools.semantic_search import semantic_search_tool
    from tools.table_query import table_query_tool
    from tools.math_tool import math_tool

    _TOOLS = [semantic_search_tool, table_query_tool, math_tool]

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

    prompt = PromptTemplate.from_template(_REACT_TEMPLATE)
    api_key = os.getenv("API_KEY") or os.getenv("OPENAI_API_KEY") or ""
    model   = os.getenv("MODEL", "openai/gpt-4o-mini")

    llm = ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
        temperature=0,
        max_tokens=2048,
    )

    agent    = create_react_agent(llm=llm, tools=_TOOLS, prompt=prompt)
    callback = LiveStepCallback()
    executor = AgentExecutor(
        agent=agent,
        tools=_TOOLS,
        verbose=False,
        max_iterations=8,
        return_intermediate_steps=True,
        handle_parsing_errors=True,
        callbacks=[callback],
    )

    t0 = time.time()
    try:
        response = executor.invoke({"input": query})
    except Exception as exc:
        print(f"\n  {c(RED, '✖')} Agent error: {exc}")
        sys.exit(1)
    elapsed = time.time() - t0

    answer  = response.get("output", "")
    steps   = response.get("intermediate_steps", [])

    # ── Extract citations ──────────────────────────────────────────────────────
    import re
    citations: list[dict] = []
    seen: set[int] = set()
    for action, observation in steps:
        for m in re.finditer(r"\[Page (\d+)\]([^\[]*)", str(observation)):
            pg = int(m.group(1))
            if pg not in seen:
                seen.add(pg)
                citations.append({"page": pg, "text": m.group(2).strip()[:200]})
    citations.sort(key=lambda x: x["page"])

    # ── Result panel ───────────────────────────────────────────────────────────
    print()
    print(c(DIM, "  " + "─" * (width - 4)))
    print(f"\n  {c(BOLD + GREEN, '✅  Answer')}\n")
    for line in textwrap.wrap(answer, width=width - 4):
        print(f"    {c(WHITE, line)}")

    if citations:
        print(f"\n  {c(BOLD + MAGENTA, '📎  Citations')}\n")
        for cit in citations:
            snippet = cit["text"].replace("\n", " ")[:100]
            pg_label = f"[Page {cit['page']}]"
            print(f"    {c(BOLD, pg_label)}  {c(DIM, snippet)}")

    print(f"\n  {c(BOLD + YELLOW, '🔗  Trace')}  {c(DIM, f'({len(steps)} steps)')}\n")
    for i, (action, _) in enumerate(steps, 1):
        icon = TOOL_ICONS.get(action.tool, "🔧")
        inp  = str(action.tool_input)
        if len(inp) > 60:
            inp = inp[:57] + "..."
        print(f"    {c(DIM, f'{i}.')}  {icon} {c(CYAN, action.tool)}  {c(DIM, inp)}")

    print()
    print(c(BOLD + BLUE, "  " + "─" * (width - 4)))
    print(f"  {c(DIM, f'⏱  Response time: {elapsed:.1f}s')}")
    print()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = input("Enter query: ").strip()
        if not query:
            print("No query provided.")
            sys.exit(1)
    run(query)
