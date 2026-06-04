'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Library, UploadCloud, Database, FileText, Plus, LogOut, User as UserIcon } from 'lucide-react';
import { api, PDFMeta, StorageInfo } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isGuest, signOut } = useAuth();
  const [pdfs, setPdfs] = useState<PDFMeta[]>([]);
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
    router.refresh();
  };

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
    api.getStorage().then((s) => {
      if (!cancelled) setStorage(s);
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
        {/* Storage usage meter */}
        {storage?.available && (() => {
          const pct = Math.min(100, Math.max(0, (storage.estimated_pod_mb / storage.limit_mb) * 100));
          const used = Math.round(storage.estimated_pod_mb);
          const limitLabel = storage.limit_mb >= 1024 ? `${Math.round(storage.limit_mb / 1024)} GB` : `${Math.round(storage.limit_mb)} MB`;
          const high = pct >= 88; // near the 900 MB eviction high-water mark
          return (
            <div className="storage-meter" title={`${used} MB of ${limitLabel} used`}>
              <div className="storage-meter-head">
                <span>Storage</span>
                <span>{used} MB / {limitLabel}</span>
              </div>
              <div className="storage-bar">
                <div
                  className="storage-fill"
                  style={{
                    width: `${pct}%`,
                    background: high
                      ? 'var(--danger-color)'
                      : 'linear-gradient(90deg, var(--accent-color), var(--accent-secondary))',
                  }}
                />
              </div>
            </div>
          );
        })()}

        {/* Account row */}
        {user && (
          <div className="account-row">
            <UserIcon size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <span className="account-email">{isGuest ? 'Guest session' : user.email}</span>
            {isGuest && <span className="account-badge">Guest</span>}
            <button className="account-signout" onClick={handleSignOut} title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
