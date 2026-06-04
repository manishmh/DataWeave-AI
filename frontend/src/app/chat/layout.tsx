import AppLayout from '@/components/AppLayout';

// Shared shell for every /chat route, including /chat/upload and /chat/[pdfId].
// Keeping the layout at this level means navigating between "upload" and an
// existing conversation never tears down the sidebar — it stays one app.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <AppLayout>{children}</AppLayout>;
}
