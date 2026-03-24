'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Calendar, HardDrive, ArrowRight, Loader2 } from 'lucide-react';
import { api, PDFMeta } from '@/lib/api';

export default function LibraryPage() {
  const [pdfs, setPdfs] = useState<PDFMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPdfs = async () => {
      try {
        const data = await api.getPDFs();
        setPdfs(data);
      } catch (err) {
        setError('Failed to load PDFs. Is the backend running?');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPdfs();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="spinner" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Document Library</h1>
        <p className="page-subtitle">Select a document to start asking questions.</p>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', borderRadius: '8px', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {pdfs.length === 0 && !error ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center' }}>
          <FileText size={48} style={{ color: 'var(--text-secondary)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No documents found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Upload a PDF document to start querying its contents using agentic AI.
          </p>
          <Link href="/upload" className="glass-button primary">
            <ArrowRight size={18} />
            Upload Document
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
          {pdfs.map((pdf) => (
            <div key={pdf.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', transition: 'transform 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                <div style={{ padding: '10px', background: 'var(--accent-glow)', borderRadius: '10px', color: 'var(--accent-color)' }}>
                  <FileText size={24} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>
                    {pdf.name}
                  </h3>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} />
                  <span>Uploaded {formatDate(pdf.uploaded_at)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <HardDrive size={14} />
                  <span>{formatBytes(pdf.size_bytes)}</span>
                </div>
              </div>

              <Link href={`/chat/${pdf.id}`} className="glass-button primary" style={{ width: '100%' }}>
                Ask Questions
                <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
