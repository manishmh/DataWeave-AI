'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  File as FileIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';

const MAX_SIZE_BYTES = 50 * 1024 * 1024;

// Server-side pipeline steps shown to the user once the network upload finishes.
// The backend doesn't stream progress, so we surface *what it's doing* by
// cycling through the real pipeline stages while we await the response.
const PROCESSING_STEPS = [
  'Extracting text & tables from every page…',
  'Cleaning and chunking the content…',
  'Generating semantic vector embeddings…',
  'Building the searchable knowledge index…',
];

type Phase = 'select' | 'uploading' | 'processing' | 'success';

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('select');
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always clear the stage timer on unmount.
  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  const startProcessingAnimation = () => {
    setPhase('processing');
    setStepIndex(0);
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = setInterval(() => {
      // Advance through stages but hold on the last one until the real
      // response arrives (we never auto-complete the final step).
      setStepIndex((i) => Math.min(i + 1, PROCESSING_STEPS.length - 1));
    }, 2200);
  };

  const stopProcessingAnimation = () => {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError('');
    const isPdf =
      selectedFile.type === 'application/pdf' ||
      selectedFile.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Only PDF files are supported.');
      return;
    }
    if (selectedFile.size > MAX_SIZE_BYTES) {
      setError('File size must be less than 50MB.');
      return;
    }
    setFile(selectedFile);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const reset = () => {
    stopProcessingAnimation();
    setFile(null);
    setPhase('select');
    setProgress(0);
    setStepIndex(0);
    setError('');
  };

  const handleUpload = async () => {
    if (!file) return;
    setError('');
    setProgress(0);
    setPhase('uploading');

    try {
      const result = await api.uploadPDF(file, (p) => {
        setProgress(p);
        // Once bytes are fully transferred, the server begins ETL + indexing.
        if (p >= 100) startProcessingAnimation();
      });

      stopProcessingAnimation();
      setStepIndex(PROCESSING_STEPS.length - 1);
      setPhase('success');
      setTimeout(() => router.push(`/chat/${result.id}`), 1200);
    } catch (err: any) {
      stopProcessingAnimation();
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          'Failed to process the document. Please check that the backend is reachable and try again.'
      );
      setPhase('select');
      setProgress(0);
    }
  };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <div className="page-header" style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 className="page-title">New Document</h1>
        <p className="page-subtitle">
          Upload a PDF to extract, index, and start chatting with it.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '40px' }}>
        {/* ---------- Dropzone ---------- */}
        {phase === 'select' && !file && (
          <div
            role="button"
            tabIndex={0}
            style={{
              border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--panel-border)'}`,
              borderRadius: '16px',
              padding: '64px 32px',
              textAlign: 'center',
              backgroundColor: isDragging ? 'rgba(139, 92, 246, 0.06)' : 'transparent',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,application/pdf"
              style={{ display: 'none' }}
            />
            <UploadCloud
              size={64}
              style={{
                color: isDragging ? 'var(--accent-color)' : 'var(--text-secondary)',
                margin: '0 auto 24px',
                transition: 'color 0.2s ease',
              }}
            />
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              Drag &amp; drop your PDF here
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              or click to browse from your computer · Max 50MB
            </p>
            <button
              className="glass-button primary"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Select File
            </button>
          </div>
        )}

        {/* ---------- Selected file, ready to process ---------- */}
        {phase === 'select' && file && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '16px',
                padding: '20px 24px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '16px',
                marginBottom: '32px',
                position: 'relative',
              }}
            >
              <div
                style={{
                  padding: '16px',
                  background: 'var(--accent-glow)',
                  borderRadius: '12px',
                  color: 'var(--accent-color)',
                }}
              >
                <FileIcon size={32} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>
                  {file.name}
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB · PDF
                </p>
              </div>
              <button
                onClick={reset}
                title="Remove file"
                className="glass-button"
                style={{ padding: '6px', position: 'absolute', top: '-10px', right: '-10px' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button className="glass-button" onClick={reset}>
                Cancel
              </button>
              <button className="glass-button primary" onClick={handleUpload}>
                <UploadCloud size={16} />
                Process Document
              </button>
            </div>
          </div>
        )}

        {/* ---------- Uploading (real network %) ---------- */}
        {phase === 'uploading' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Uploading document</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '28px' }}>
              Transferring {file?.name} to the server…
            </p>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p style={{ fontWeight: 600, marginTop: '12px' }}>{progress}%</p>
          </div>
        )}

        {/* ---------- Processing (server pipeline) ---------- */}
        {phase === 'processing' && (
          <div style={{ padding: '8px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Processing document</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                This can take up to a minute for large documents.
              </p>
            </div>

            <div className="progress-track">
              <div className="progress-fill indeterminate" />
            </div>

            <ul className="step-list">
              {PROCESSING_STEPS.map((label, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <li
                    key={label}
                    className="step-item"
                    style={{ opacity: done || active ? 1 : 0.4 }}
                  >
                    <span className="step-icon">
                      {done ? (
                        <CheckCircle2 size={18} style={{ color: 'var(--success-color)' }} />
                      ) : active ? (
                        <Loader2 size={18} className="icon-spin" style={{ color: 'var(--accent-secondary)' }} />
                      ) : (
                        <span className="step-dot" />
                      )}
                    </span>
                    <span style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* ---------- Success ---------- */}
        {phase === 'success' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.2)',
                color: 'var(--success-color)',
                marginBottom: '24px',
              }}
            >
              <CheckCircle2 size={48} />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Ready to chat!</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Opening your conversation…</p>
          </div>
        )}

        {/* ---------- Error ---------- */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: 'var(--danger-color)',
              borderRadius: '8px',
              marginTop: '24px',
            }}
          >
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
