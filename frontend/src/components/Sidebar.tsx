'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Library, UploadCloud, Settings, Database } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const routes = [
    {
      label: 'Library',
      icon: Library,
      href: '/library',
    },
    {
      label: 'Upload Document',
      icon: UploadCloud,
      href: '/upload',
    },
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

      <div className="nav-links">
        {routes.map((route) => {
          const isActive = pathname === route.href || pathname.startsWith(`${route.href}/`);
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

      <div style={{ marginTop: 'auto' }}>
        <Link href="#" className="nav-item opacity-50 cursor-not-allowed pointer-events-none">
          <Settings size={20} />
          Settings (WIP)
        </Link>
      </div>
    </div>
  );
}
