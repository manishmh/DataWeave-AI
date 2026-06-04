import '@/styles/globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthProvider';

export const metadata: Metadata = {
  title: 'Nexus Data | Agentic PDF Search',
  description: 'Upload and interact with your PDF documents using agentic AI.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
