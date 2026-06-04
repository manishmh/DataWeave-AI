import { redirect } from 'next/navigation';

// Upload now lives inside the chat experience as a subroute so the app shell
// (sidebar + conversation context) never tears down. Keep this redirect so any
// old /upload links/bookmarks still resolve.
export default function LegacyUploadRedirect() {
  redirect('/chat/upload');
}
