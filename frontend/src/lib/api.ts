import axios from 'axios';

// Backend base URL. In production (Vercel) set NEXT_PUBLIC_API_URL to the
// deployed backend, e.g. https://your-space.hf.space — falls back to the
// local FastAPI dev server otherwise. (NEXT_PUBLIC_ vars are inlined at build
// time and exposed to the browser, which is correct here.)
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // NOTE: we deliberately do NOT set a global 'Content-Type' here.
  // Axios infers 'application/json' for plain-object bodies and the correct
  // 'multipart/form-data; boundary=...' for FormData. Hard-coding the header
  // strips the multipart boundary and breaks file uploads (FastAPI 422).
});

export interface PDFMeta {
  id: string;
  name: string;
  uploaded_at: string;
  size_bytes: number;
}

export interface CitationItem {
  page: number;
  text: string;
}

export interface TraceStep {
  step: number;
  thought: string;
  action: string;
  action_input: string;
  observation: string;
}

export interface QueryResponse {
  answer: string;
  citations: CitationItem[];
  trace: TraceStep[];
}

export interface StorageInfo {
  available: boolean;
  resident_mb: number;
  baseline_mb: number;
  estimated_pod_mb: number;
  limit_mb: number;
  total_points?: number;
  pdfs?: { id: string; name: string; points: number }[];
}

export const api = {
  // Upload a PDF
  uploadPDF: async (file: File, onProgress?: (percent: number) => void): Promise<PDFMeta> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<PDFMeta>('/upload', formData, {
      // Let the browser set 'multipart/form-data' with the correct boundary.
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      },
    });
    return response.data;
  },

  // Get all uploaded PDFs
  getPDFs: async (): Promise<PDFMeta[]> => {
    const response = await apiClient.get<PDFMeta[]>('/pdfs');
    return response.data;
  },

  // Submit a query about a specific PDF
  queryAgent: async (pdfId: string, query: string): Promise<QueryResponse> => {
    const response = await apiClient.post<QueryResponse>('/query', {
      query,
      pdf_id: pdfId,
    });
    return response.data;
  },

  // Lightweight liveness probe for the backend-status indicator.
  health: async (): Promise<boolean> => {
    try {
      const response = await apiClient.get('/health', { timeout: 4000 });
      return response.status === 200;
    } catch {
      return false;
    }
  },

  // Qdrant storage usage (for the sidebar meter). Null if unreachable.
  getStorage: async (): Promise<StorageInfo | null> => {
    try {
      const response = await apiClient.get<StorageInfo>('/storage', { timeout: 8000 });
      return response.data;
    } catch {
      return null;
    }
  },
};
