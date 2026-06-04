'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Library, UploadCloud, Settings, Database, FileText, Plus } from 'lucide-react';
import { api, PDFMeta } from '@/lib/api';

export default function Sidebar() {
  const pathname = usePathname();
  const [pdfs, setPdfs] = useState<PDFMeta[]>([]);
  const [online, setOnline] = useState<boolean | null>(null);

  // Re-fetch the document list whenever the route changes so a freshly
  // uploaded PDF shows up immediately after redirect to its chat.
  useEffect(() => {
    let cancelled = false;
    api
      .getPDFs()
      .then((data) => {
        if (!cancelled) setPdfs(data);
      })
      .catch(() => {
        if (!cancelled) setPdfs([]);
      });
    api.health().then((ok) => {
      if (!cancelled) setOnline(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const activeId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;

  const navRoutes = [
    { label: 'Library', icon: Library, href: '/library' },
    { label: 'Upload Document', icon: UploadCloud, href: '/chat/upload' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-icon">
            <Database size={20} />
          </div>
          Nexus Data
        </div>
      </div>

      {/* Primary navigation */}
      <div className="nav-links" style={{ flex: '0 0 auto' }}>
        {navRoutes.map((route) => {
          const isActive =
            route.href === '/chat/upload'
              ? pathname === '/chat/upload'
              : pathname === route.href || pathname.startsWith(`${route.href}/`);
          return (
            <Link
              key={route.href}
              href={route.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <route.icon size={20} />
              {route.label}
            </Link>
          );
        })}
      </div>

      {/* Document list — switch conversations without leaving the chat shell */}
      <div className="doc-section">
        <div className="doc-section-header">
          <span>Documents</span>
          <Link href="/chat/upload" title="New document" className="doc-add">
            <Plus size={14} />
          </Link>
        </div>
        <div className="doc-list">
          {pdfs.length === 0 ? (
            <p className="doc-empty">No documents yet.</p>
          ) : (
            pdfs.map((pdf) => (
              <Link
                key={pdf.id}
                href={`/chat/${pdf.id}`}
                className={`doc-item ${activeId === pdf.id ? 'active' : ''}`}
                title={pdf.name}
              >
                <FileText size={16} />
                <span className="doc-name">{pdf.name}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
        {/* Backend status indicator */}
        <div className="backend-status">
          <span
            className="status-dot"
            style={{
              background:
                online === null
                  ? 'var(--text-secondary)'
                  : online
                  ? 'var(--success-color)'
                  : 'var(--danger-color)',
            }}
          />
          {online === null ? 'Checking backend…' : online ? 'Backend online' : 'Backend offline'}
        </div>

        <span className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <Settings size={20} />
          Settings (WIP)
        </span>
      </div>
    </div>
  );
}
