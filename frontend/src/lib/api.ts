import axios from 'axios';

// FastAPI default port
const API_BASE_URL = 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
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

export const api = {
  // Upload a PDF
  uploadPDF: async (file: File, onProgress?: (percent: number) => void): Promise<PDFMeta> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<PDFMeta>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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
};
