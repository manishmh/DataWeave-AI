"""
tools/math_tool.py
------------------
LangChain Tool: MathTool

Performs deterministic computation WITHOUT involving the LLM.

Supported operations (JSON input):

1. CAGR
   {"op": "cagr", "start": 5000, "end": 8000, "years": 3}
   → ((8000/5000)^(1/3) - 1) * 100  → "17.0%"

2. Safe arithmetic eval
   {"op": "eval", "expr": "22500 * 1.12 / 100"}
   → Evaluates only numeric expressions (no function calls, builtins, etc.)

3. Percentage change
   {"op": "pct_change", "old": 5000, "new": 6500}
   → ((6500-5000)/5000) * 100 → "30.0%"

Security: eval mode uses a whitelist of allowed AST nodes.
"""

from __future__ import annotations

import ast
import json
import operator
from typing import Union

from langchain.tools import Tool

Number = Union[int, float]

# ---------------------------------------------------------------------------
# Safe eval – only numeric literals + basic operators
# ---------------------------------------------------------------------------

_ALLOWED_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(expr: str) -> Number:
    """Evaluate a numeric expression string safely (no builtins, no imports)."""

    def _eval_node(node: ast.AST) -> Number:
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp):
            op_type = type(node.op)
            if op_type not in _ALLOWED_OPS:
                raise ValueError(f"Operator {op_type.__name__} not allowed.")
            left = _eval_node(node.left)
            right = _eval_node(node.right)
            return _ALLOWED_OPS[op_type](left, right)
        if isinstance(node, ast.UnaryOp):
            op_type = type(node.op)
            if op_type not in _ALLOWED_OPS:
                raise ValueError(f"Operator {op_type.__name__} not allowed.")
            return _ALLOWED_OPS[op_type](_eval_node(node.operand))
        raise ValueError(f"Unsupported expression node: {type(node).__name__}")

    tree = ast.parse(expr.strip(), mode="eval")
    return _eval_node(tree.body)


# ---------------------------------------------------------------------------
# Math operations
# ---------------------------------------------------------------------------

def _compute_cagr(start: Number, end: Number, years: Number) -> str:
    if start <= 0:
        return "ERROR: start value must be positive."
    if years <= 0:
        return "ERROR: years must be positive."
    cagr = ((end / start) ** (1.0 / years) - 1) * 100
    return f"{cagr:.2f}%  (CAGR over {years} years from {start:,} to {end:,})"


def _compute_pct_change(old: Number, new_val: Number) -> str:
    if old == 0:
        return "ERROR: old value cannot be zero."
    pct = ((new_val - old) / old) * 100
    direction = "increase" if pct >= 0 else "decrease"
    return f"{abs(pct):.2f}% {direction}  (from {old:,} to {new_val:,})"


# ---------------------------------------------------------------------------
# Tool entry point
# ---------------------------------------------------------------------------

def _math(input_str: str) -> str:
    try:
        params = json.loads(input_str)
    except json.JSONDecodeError as e:
        return f"ERROR: Invalid JSON – {e}"

    op = params.get("op", "").lower()

    try:
        if op == "cagr":
            start = float(params["start"])
            end = float(params["end"])
            years = float(params["years"])
            return _compute_cagr(start, end, years)

        elif op == "eval":
            expr = str(params.get("expr", ""))
            result = _safe_eval(expr)
            return f"{result:,}" if isinstance(result, int) else f"{result:,.4f}"

        elif op == "pct_change":
            old = float(params["old"])
            new_val = float(params["new"])
            return _compute_pct_change(old, new_val)

        else:
            return (
                f"ERROR: Unknown operation '{op}'. "
                "Use 'cagr', 'eval', or 'pct_change'."
            )

    except KeyError as e:
        return f"ERROR: Missing required parameter {e} for operation '{op}'."
    except Exception as e:
        return f"ERROR: Computation failed – {e}"


math_tool = Tool(
    name="MathTool",
    func=_math,
    description=(
        "Performs exact mathematical computations. ALWAYS use this tool for any "
        "arithmetic, CAGR, or percentage calculations – never compute in your head. "
        "Input must be a JSON string. Supported operations:\n"
        "  1. CAGR: {\"op\": \"cagr\", \"start\": 5000, \"end\": 8000, \"years\": 3}\n"
        "  2. Safe eval: {\"op\": \"eval\", \"expr\": \"22500 * 1.12\"}\n"
        "  3. % change: {\"op\": \"pct_change\", \"old\": 5000, \"new\": 6500}"
    ),
)


def run_math(input_str: str) -> str:
    return _math(input_str)
