'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Database, Loader2, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.replace('/library');
    router.refresh();
  };

  return (
    <div className="auth-shell">
      <div className="bg-blob violet" />
      <div className="bg-blob cyan" />
      <form onSubmit={handleSubmit} className="auth-card glass-panel">
        <div className="auth-logo">
          <div className="logo-icon"><Database size={20} /></div>
          Nexus Data
        </div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Sign in to your documents and chat history.</p>

        {error && <div className="auth-error">{error}</div>}

        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} required
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label className="auth-label">Password</label>
        <input className="auth-input" type="password" value={password} required
          onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />

        <button type="submit" className="glass-button primary auth-submit" disabled={busy}>
          {busy ? <Loader2 size={18} className="icon-spin" /> : <LogIn size={18} />}
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="auth-foot">
          No account? <Link href="/register" className="auth-link">Create one</Link>
        </p>
        <p className="auth-foot">
          <Link href="/guest" className="auth-link">Continue as guest →</Link>
        </p>
      </form>
    </div>
  );
}
