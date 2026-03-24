# DataWeave-AI

DataWeave-AI is a production-grade agentic knowledge system designed to extract, index, and query information from documents such as the Cyber Ireland 2022 PDF. It features a robust Python backend powered by a LangChain ReAct agent and a modern Next.js React frontend for an intuitive user experience.

## Project Structure

The repository is organized into two main directories:

- **[`backend/`](./backend)**: A FastAPI-based Python server orchestrating a LangChain ReAct agent. It includes an ETL pipeline for PDF extraction (using `pdfplumber` and `camelot`), vector indexing via ChromaDB, and specialized tools for Semantic Search, Table Querying, and Deterministic Math.
- **[`frontend/`](./frontend)**: A Next.js 14 web application built with React, animated using Framer Motion, and featuring Lucide React icons, providing the user interface to interact with the agentic backend.

In the root directory, you'll also find the comprehensive project report: `Nexus_Data_Project_Report.pdf`.

## Getting Started

### 1. Backend Setup

Navigate to the `backend/` directory and install the required Python dependencies:

```bash
cd backend
pip install -r requirements.txt
```

Place your source PDF (e.g., `cyber_ireland_2022.pdf`) into the `backend/data/` folder, then run the ETL and indexing pipelines:

```bash
python -m etl.run_etl --pdf data/cyber_ireland_2022.pdf
python -m indexing.run_indexing
```

Start the FastAPI server:

```bash
uvicorn api.main:app --reload --port 8000
```

*Note: Ensure you have your `API_KEY` configured in `backend/.env`.*

### 2. Frontend Setup

Navigate to the `frontend/` directory and install the Node.js dependencies:

```bash
cd frontend
npm install
```

Start the Next.js development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000` while communicating with the API backend at `http://localhost:8000`.

## Core Features

- **ReAct Agent Architecture**: Intelligently routes incoming queries using specialized tools.
- **Multi-Modal Document Querying**: Capable of semantic text search, structured Pandas-based table queries, and deterministic math operations (CAGR, percentages) without relying purely on LLM guesswork.
- **Interactive UI**: A responsive, modern Next.js frontend.
- **Transparent Reasoning**: Every query generates a detailed reasoning trace logged as JSON in the backend.

## Documentation

For detailed backend API usage, tool configurations, and underlying architecture details, please refer to the [Backend README](./backend/README.md). The final project summary and findings are available in the root directory as `Nexus_Data_Project_Report.pdf`.
