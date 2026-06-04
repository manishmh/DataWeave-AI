import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client. Uses the public anon key — safe to expose;
// row-level security on the tables is what actually protects data.
//
// Fallback placeholders keep `next build` (static prerender) from throwing when
// the env vars aren't present at build time. No network calls happen during
// prerender, and the real NEXT_PUBLIC_* values are inlined when set (locally in
// .env.local, or in the Vercel project settings).
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window !== 'undefined') {
      // Only a problem at runtime in the browser — surface it clearly.
      console.warn(
        '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
          'Auth and chat history will not work until they are configured.'
      );
    }
    return createBrowserClient(
      url || 'https://placeholder.supabase.co',
      key || 'placeholder-anon-key'
    );
  }

  return createBrowserClient(url, key);
}
