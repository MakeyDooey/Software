// src/components/AuthModal.tsx
// Login / Sign-up / Forgot-password modal.
// Styled to match the MakeyDooey orange brand and dark/light theme system.

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme, T } from '../theme/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalView = 'signIn' | 'signUp' | 'forgotPassword' | 'checkEmail';

interface AuthModalProps {
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AuthModal: React.FC<AuthModalProps> = ({ onClose }) => {
  const { dark } = useTheme();
  const tok = T(dark);
  const { signIn, signUp, signInGoogle, resetPassword } = useAuth();

  const [view,     setView]     = useState<ModalView>('signIn');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearForm = () => { setEmail(''); setPassword(''); setConfirm(''); setError(null); };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) { setError(error.message); return; }
    onClose();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    const { error } = await signUp(email, password);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setView('checkEmail');
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setView('checkEmail');
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signInGoogle();
    setLoading(false);
    if (error) setError(error.message);
    // Google redirects away, so no onClose() here
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9000,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
  };

  const modal: React.CSSProperties = {
    width: '100%', maxWidth: '420px',
    background: tok.cardBg,
    border: `1.5px solid ${tok.border}`,
    borderRadius: '16px',
    padding: '32px 28px',
    boxShadow: tok.shadowStrong,
    fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
    position: 'relative',
  };

  const title: React.CSSProperties = {
    margin: '0 0 6px',
    fontSize: '22px',
    fontWeight: 800,
    color: tok.textPrimary,
  };

  const subtitle: React.CSSProperties = {
    margin: '0 0 24px',
    fontSize: '13px',
    color: tok.textSecondary,
  };

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '12px',
    fontWeight: 700,
    color: tok.textSecondary,
    marginBottom: '5px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  const input: React.CSSProperties = {
    width: '100%',
    padding: '10px 13px',
    borderRadius: '8px',
    border: `1.5px solid ${tok.border}`,
    background: tok.inputBg,
    color: tok.textPrimary,
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '14px',
  };

  const primaryBtn: React.CSSProperties = {
    width: '100%',
    padding: '11px',
    borderRadius: '9px',
    border: 'none',
    background: tok.orange,
    color: '#fff',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 700,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    marginBottom: '10px',
    transition: 'background 0.15s',
  };

  const googleBtn: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '9px',
    border: `1.5px solid ${tok.border}`,
    background: tok.cardBg,
    color: tok.textPrimary,
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '18px',
  };

  const divider: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    margin: '4px 0 14px',
    color: tok.textMuted, fontSize: '12px',
  };

  const divLine: React.CSSProperties = {
    flex: 1, height: '1px', background: tok.borderSubtle,
  };

  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none',
    color: tok.orange, fontFamily: 'inherit',
    fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', padding: 0,
    textDecoration: 'underline',
  };

  const errorBox: React.CSSProperties = {
    padding: '10px 13px',
    borderRadius: '8px',
    background: tok.redFaint,
    color: tok.redText,
    fontSize: '13px',
    marginBottom: '14px',
    border: `1px solid ${tok.red}33`,
  };

  const closeBtn: React.CSSProperties = {
    position: 'absolute', top: '14px', right: '16px',
    background: 'none', border: 'none',
    color: tok.textMuted, fontSize: '20px',
    cursor: 'pointer', lineHeight: 1,
  };

  // ── Views ──────────────────────────────────────────────────────────────────

  if (view === 'checkEmail') {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <button style={closeBtn} onClick={onClose}>×</button>
          <p style={{ fontSize: '40px', margin: '0 0 10px', textAlign: 'center' }}>📬</p>
          <h2 style={{ ...title, textAlign: 'center' }}>Check your email</h2>
          <p style={{ ...subtitle, textAlign: 'center', marginBottom: 0 }}>
            We sent a link to <strong style={{ color: tok.orange }}>{email}</strong>.
            Click it to continue.
          </p>
        </div>
      </div>
    );
  }

  if (view === 'forgotPassword') {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <button style={closeBtn} onClick={onClose}>×</button>
          <h2 style={title}>Reset password</h2>
          <p style={subtitle}>We'll send a reset link to your email.</p>

          {error && <div style={errorBox}>{error}</div>}

          <form onSubmit={handleForgotPassword}>
            <label style={label}>Email</label>
            <input
              style={input} type="email" required autoFocus
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
            <button style={primaryBtn} type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '13px', color: tok.textSecondary, margin: 0 }}>
            Remember it?{' '}
            <button style={linkBtn} onClick={() => { clearForm(); setView('signIn'); }}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  if (view === 'signUp') {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={modal} onClick={e => e.stopPropagation()}>
          <button style={closeBtn} onClick={onClose}>×</button>
          <h2 style={title}>Create account</h2>
          <p style={subtitle}>Save your settings across devices.</p>

          {/* Google */}
          <button style={googleBtn} onClick={handleGoogle} type="button" disabled={loading}>
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.5 1.2 8.9 3.2l6.6-6.6C35.6 2.5 30.1 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.7 6C12.2 13.1 17.6 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/>
              <path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.7-6C1 16.4 0 20.1 0 24s1 7.6 2.7 10.6l7.7-6z"/>
              <path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.4 2.2-6.4 0-11.8-4.3-13.6-10.1l-7.7 6C6.7 42.6 14.7 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <div style={divider}><span style={divLine}/> or <span style={divLine}/></div>

          {error && <div style={errorBox}>{error}</div>}

          <form onSubmit={handleSignUp}>
            <label style={label}>Email</label>
            <input
              style={input} type="email" required autoFocus
              placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
            <label style={label}>Password</label>
            <input
              style={input} type="password" required
              placeholder="Min 6 characters"
              value={password} onChange={e => setPassword(e.target.value)}
            />
            <label style={label}>Confirm Password</label>
            <input
              style={input} type="password" required
              placeholder="Repeat password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
            />
            <button style={primaryBtn} type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '13px', color: tok.textSecondary, margin: 0 }}>
            Already have an account?{' '}
            <button style={linkBtn} onClick={() => { clearForm(); setView('signIn'); }}>
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Default: Sign In ───────────────────────────────────────────────────────
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <button style={closeBtn} onClick={onClose}>×</button>
        <h2 style={title}>Welcome back</h2>
        <p style={subtitle}>Sign in to sync your MakeyDooey settings.</p>

        {/* Google */}
        <button style={googleBtn} onClick={handleGoogle} type="button" disabled={loading}>
          <svg width="16" height="16" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.5 1.2 8.9 3.2l6.6-6.6C35.6 2.5 30.1 0 24 0 14.7 0 6.7 5.4 2.7 13.3l7.7 6C12.2 13.1 17.6 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/>
            <path fill="#FBBC05" d="M10.4 28.6c-.5-1.4-.8-2.9-.8-4.6s.3-3.2.8-4.6l-7.7-6C1 16.4 0 20.1 0 24s1 7.6 2.7 10.6l7.7-6z"/>
            <path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.4l-7.5-5.8c-2 1.4-4.6 2.2-7.4 2.2-6.4 0-11.8-4.3-13.6-10.1l-7.7 6C6.7 42.6 14.7 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div style={divider}><span style={divLine}/> or <span style={divLine}/></div>

        {error && <div style={errorBox}>{error}</div>}

        <form onSubmit={handleSignIn}>
          <label style={label}>Email</label>
          <input
            style={input} type="email" required autoFocus
            placeholder="you@example.com"
            value={email} onChange={e => setEmail(e.target.value)}
          />
          <label style={label}>Password</label>
          <input
            style={input} type="password" required
            placeholder="Your password"
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <div style={{ textAlign: 'right', marginTop: '-8px', marginBottom: '14px' }}>
            <button
              style={{ ...linkBtn, fontSize: '12px' }}
              type="button"
              onClick={() => { clearForm(); setView('forgotPassword'); }}
            >
              Forgot password?
            </button>
          </div>
          <button style={primaryBtn} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: tok.textSecondary, margin: 0 }}>
          No account?{' '}
          <button style={linkBtn} onClick={() => { clearForm(); setView('signUp'); }}>
            Create one
          </button>
        </p>
      </div>
    </div>
  );
};