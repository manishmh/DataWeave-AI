'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Database, Loader2, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    // If email confirmation is OFF, a session is returned → go straight in.
    if (data.session) {
      router.replace('/library');
      router.refresh();
      return;
    }
    // Otherwise the user must confirm via email first.
    setNotice('Account created. Check your email to confirm, then sign in.');
    setBusy(false);
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
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Save your documents and chat history.</p>

        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}

        <label className="auth-label">Email</label>
        <input className="auth-input" type="email" value={email} required
          onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />

        <label className="auth-label">Password</label>
        <input className="auth-input" type="password" value={password} required
          onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />

        <button type="submit" className="glass-button primary auth-submit" disabled={busy}>
          {busy ? <Loader2 size={18} className="icon-spin" /> : <UserPlus size={18} />}
          {busy ? 'Creating…' : 'Create account'}
        </button>

        <p className="auth-foot">
          Already have an account? <Link href="/login" className="auth-link">Sign in</Link>
        </p>
        <p className="auth-foot">
          <Link href="/guest" className="auth-link">Continue as guest →</Link>
        </p>
      </form>
    </div>
  );
}
