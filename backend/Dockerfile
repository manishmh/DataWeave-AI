# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# Backend image — FastAPI + ETL (camelot/ghostscript) + sentence-transformers.
# Runs anywhere that takes a Docker image: Hugging Face Spaces (port 7860),
# Google Cloud Run (injects $PORT), Fly.io, etc. The vector index lives in
# Qdrant Cloud, so this container is stateless.
# ---------------------------------------------------------------------------
FROM python:3.11-slim

# System libraries:
#   ghostscript                 → camelot table extraction (subprocess)
#   libgl1 / libglib2.0-0       → OpenCV runtime deps pulled by camelot-py[cv]
RUN apt-get update && apt-get install -y --no-install-recommends \
        ghostscript \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user. Hugging Face Spaces runs containers as uid 1000; matching it
# here keeps the runtime-writable dirs owned correctly there and everywhere.
RUN useradd -m -u 1000 appuser

ENV HOME=/home/appuser \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    # Cache the embedding model under the writable home dir (downloaded on first
    # request; ~90MB for all-MiniLM-L6-v2).
    HF_HOME=/home/appuser/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/home/appuser/.cache/sentence-transformers

WORKDIR /app

# Install CPU-only torch FIRST, from PyTorch's CPU index, so the transitive
# pull from sentence-transformers doesn't drag in the ~900MB CUDA wheel.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code (data/, logs/, .env are excluded via .dockerignore).
COPY . .

# Runtime-writable dirs owned by the non-root user.
RUN mkdir -p /app/data /app/logs && chown -R appuser:appuser /app
USER appuser

# HF Spaces defaults to 7860; Cloud Run / Fly inject $PORT and we honor it.
ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "python -m uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
