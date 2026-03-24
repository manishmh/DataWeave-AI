import Sidebar from '@/components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-container">
      {/* Background blobs */}
      <div className="bg-blob violet" />
      <div className="bg-blob cyan" />

      {/* Navigation */}
      <Sidebar />

      {/* Main viewport */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
