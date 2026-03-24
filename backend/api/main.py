"""
api/main.py
-----------
FastAPI application exposing the agentic query system.

Endpoints
---------
POST /query
    Body:     {"query": "How many cybersecurity professionals are in Ireland?"}
    Response: {"answer": "...", "citations": [...], "trace": [...]}

POST /upload
    Body:     multipart/form-data with 'file' (PDF)
    Response: {"id": "...", "name": "...", "uploaded_at": "..."}

GET /pdfs
    Response: list of uploaded PDF metadata

GET /health
    Basic liveness check.

GET /docs
    Auto-generated Swagger UI (FastAPI built-in).
"""

from __future__ import annotations

import json
import logging
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent.react_agent import run_query

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s – %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PDF Agentic Knowledge System",
    description=(
        "Production-grade agentic backend that answers questions about uploaded PDFs "
        "using ReAct reasoning, semantic search, table queries, and deterministic math."
    ),
    version="2.0.0",
)

# ---------------------------------------------------------------------------
# CORS – allow Next.js dev server and any localhost origin
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
PDFS_META_FILE = DATA_DIR / "pdfs.json"


def _load_pdfs_meta() -> list[dict]:
    if PDFS_META_FILE.exists():
        return json.loads(PDFS_META_FILE.read_text())
    return []


def _save_pdfs_meta(meta: list[dict]) -> None:
    PDFS_META_FILE.write_text(json.dumps(meta, indent=2))


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    query: str = Field(
        ...,
        min_length=3,
        max_length=2000,
        example="How many cybersecurity professionals are employed in Ireland?",
    )
    pdf_id: str | None = Field(
        None,
        description="Optional PDF ID to scope the query",
    )


class CitationItem(BaseModel):
    page: int
    text: str


class TraceStep(BaseModel):
    step: int
    thought: str
    action: str
    action_input: str
    observation: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[CitationItem]
    trace: list[TraceStep]


class PDFMeta(BaseModel):
    id: str
    name: str
    uploaded_at: str
    size_bytes: int


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "pdf-knowledge-agent"}


@app.get("/pdfs", response_model=list[PDFMeta], tags=["PDFs"])
def list_pdfs():
    """Return metadata for all uploaded PDFs."""
    return _load_pdfs_meta()


@app.post("/upload", response_model=PDFMeta, tags=["PDFs"])
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF, run ETL + indexing pipeline, and return metadata.

    The pipeline steps are:
    1. Save the PDF to data/
    2. Run ETL (pdfplumber extraction + cleaning)
    3. Run indexing (chunking → embeddings → Chroma vector store)
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_id = str(uuid.uuid4())
    safe_name = file.filename.replace(" ", "_")
    dest_path = DATA_DIR / safe_name

    # Save file
    contents = await file.read()
    dest_path.write_bytes(contents)
    size_bytes = len(contents)
    logger.info("Saved PDF %s → %s (%d bytes)", file.filename, dest_path, size_bytes)

    # Run ETL
    try:
        from etl.run_etl import run as run_etl
        run_etl(str(dest_path), str(DATA_DIR))
        logger.info("ETL complete for %s", safe_name)
    except Exception as exc:
        logger.exception("ETL failed for %s", safe_name)
        raise HTTPException(status_code=500, detail=f"ETL failed: {exc}")

    # Run Indexing
    try:
        from indexing.run_indexing import run as run_indexing
        run_indexing(str(DATA_DIR))
        logger.info("Indexing complete for %s", safe_name)
    except Exception as exc:
        logger.exception("Indexing failed for %s", safe_name)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}")

    # Persist metadata
    meta_entry = {
        "id": pdf_id,
        "name": file.filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "size_bytes": size_bytes,
    }
    existing = _load_pdfs_meta()
    existing.append(meta_entry)
    _save_pdfs_meta(existing)

    return meta_entry


@app.post("/query", response_model=QueryResponse, tags=["Agent"])
def query_agent(request: QueryRequest):
    """
    Submit a natural-language question about an uploaded PDF.

    The agent will:
    1. Use SemanticSearch to find relevant passages
    2. Use TableQuery for structured data comparisons
    3. Use MathTool for all computations (CAGR, arithmetic)
    4. Return an answer with verifiable page citations and full reasoning trace
    """
    logger.info("POST /query  query=%r  pdf_id=%r", request.query, request.pdf_id)
    try:
        result = run_query(request.query)
    except Exception as exc:
        logger.exception("Unhandled error in run_query")
        raise HTTPException(status_code=500, detail=str(exc))

    return QueryResponse(
        answer=result["answer"],
        citations=[CitationItem(**c) for c in result["citations"]],
        trace=[TraceStep(**s) for s in result["trace"]],
    )
