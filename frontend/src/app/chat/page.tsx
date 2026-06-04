import { redirect } from 'next/navigation';

// Visiting /chat with no document selected drops you at the library.
export default function ChatIndex() {
  redirect('/library');
}
