'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { DEMO_EMAIL } from '@/context/AuthProvider';

const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || '';

/**
 * /guest — zero-friction entry for recruiters from a resume link.
 * Signs into the shared, pre-seeded demo account (one network call), then
 * drops the visitor straight into the app with dummy data already present.
 * The session is torn down when they leave the tab.
 */
export default function GuestPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // guard against double-invoke in dev StrictMode
    started.current = true;

    const supabase = createClient();

    (async () => {
      // Already signed in (e.g. cached session) → go straight in, fast revisit.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        router.replace('/library');
        return;
      }

      // 1) Try to sign in to the shared demo account.
      let { error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });

      // 2) If it doesn't exist yet, create it on the fly (self-provisioning),
      //    so there's no manual dashboard step.
      if (error) {
        const { data: signUp, error: signUpError } = await supabase.auth.signUp({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });

        if (signUpError) {
          // Most likely the account exists but the password env doesn't match it.
          setError(
            `${signUpError.message}. If the demo account already exists, make sure ` +
              `NEXT_PUBLIC_DEMO_PASSWORD matches it.`
          );
          return;
        }

        if (!signUp.session) {
          // Email confirmation is ON, so the new account can't log in yet.
          setError(
            'Demo account created but email confirmation is enabled. In Supabase → ' +
              'Authentication → Providers → Email, turn OFF "Confirm email", then reload.'
          );
          return;
        }
        error = null; // signed up + session granted → we're in
      }

      // Mark as a guest session and tear it down when the tab closes.
      sessionStorage.setItem('guest', '1');
      const teardown = () => {
        // Best-effort sign-out so the next visitor starts fresh.
        navigator.sendBeacon?.('/');
        void supabase.auth.signOut();
      };
      window.addEventListener('pagehide', teardown, { once: true });

      router.replace('/library');
    })();
  }, [router]);

  return (
    <div className="auth-shell">
      <div className="bg-blob violet" />
      <div className="bg-blob cyan" />
      <div className="auth-card glass-panel" style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div className="logo-icon"><Database size={20} /></div>
          Nexus Data
        </div>
        {error ? (
          <>
            <h1 className="auth-title">Guest sign-in failed</h1>
            <div className="auth-error">{error}</div>
            <p className="auth-sub" style={{ marginTop: 12 }}>
              The demo account may not be set up yet.
            </p>
          </>
        ) : (
          <>
            <Loader2 size={32} className="icon-spin" style={{ color: 'var(--accent-color)', margin: '16px auto' }} />
            <h1 className="auth-title">Setting up your guest session…</h1>
            <p className="auth-sub">One moment — loading a ready-to-explore demo.</p>
          </>
        )}
      </div>
    </div>
  );
}
