'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, File, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError('');
    
    if (selectedFile.type !== 'application/pdf') {
      setError('Only PDF files are supported.');
      return;
    }
    
    if (selectedFile.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB.');
      return;
    }
    
    setFile(selectedFile);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    setError('');
    
    try {
      const result = await api.uploadPDF(file, (p) => setProgress(p));
      setSuccess(true);
      
      // Redirect to chat after brief success message
      setTimeout(() => {
        router.push(`/chat/${result.id}`);
      }, 1500);
      
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to upload document. Is the backend running?');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header" style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 className="page-title">Upload Knowledge</h1>
        <p className="page-subtitle">Add a new PDF document to process it through the agentic backend.</p>
      </div>

      <div className="glass-panel" style={{ padding: '40px' }}>
        {!file && !isUploading && !success && (
          <div 
            style={{
              border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--panel-border)'}`,
              borderRadius: '16px',
              padding: '64px 32px',
              textAlign: 'center',
              backgroundColor: isDragging ? 'rgba(139, 92, 246, 0.05)' : 'transparent',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
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
                transition: 'color 0.2s ease'
              }} 
            />
            <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>
              Drag & drop your PDF here
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              or click to browse from your computer (Max 50MB)
            </p>
            <button className="glass-button primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Select File
            </button>
          </div>
        )}

        {file && !isUploading && !success && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '16px', 
              padding: '24px', 
              background: 'rgba(255,255,255,0.05)', 
              borderRadius: '16px',
              marginBottom: '32px'
            }}>
              <div style={{ padding: '16px', background: 'var(--accent-glow)', borderRadius: '12px', color: 'var(--accent-color)' }}>
                <File size={32} />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '4px' }}>{file.name}</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button className="glass-button" onClick={() => setFile(null)}>
                Cancel
              </button>
              <button className="glass-button primary" onClick={handleUpload}>
                Process Document
              </button>
            </div>
          </div>
        )}

        {isUploading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>Processing Document</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Extracting text, analyzing tables, and building the vector index...
            </p>
            
            <div style={{ 
              width: '100%', 
              maxWidth: '400px', 
              height: '8px', 
              background: 'rgba(255,255,255,0.1)', 
              borderRadius: '4px',
              margin: '0 auto 16px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                height: '100%', 
                width: `${progress}%`, 
                background: 'linear-gradient(90deg, var(--accent-color), var(--accent-secondary))',
                transition: 'width 0.3s ease',
                borderRadius: '4px'
              }} />
            </div>
            <p style={{ fontWeight: 600 }}>{progress}% Uploaded</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '16px' }}>
              Note: This may take up to a minute depending on the document size.
            </p>
          </div>
        )}

        {success && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.2)',
              color: 'var(--success-color)',
              marginBottom: '24px'
            }}>
              <CheckCircle2 size={48} />
            </div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Processing Complete!</h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              Redirecting to chat interface...
            </p>
          </div>
        )}

        {error && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            padding: '16px', 
            background: 'rgba(239, 68, 68, 0.1)', 
            color: 'var(--danger-color)', 
            borderRadius: '8px', 
            marginTop: '24px' 
          }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
