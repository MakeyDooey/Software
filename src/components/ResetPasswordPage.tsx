// src/components/ResetPasswordPage.tsx
// Shown when the user arrives via a Supabase password reset email link.
// Supabase appends #access_token=...&type=recovery to the URL.
// This component detects that, lets the user set a new password, then
// clears the hash and redirects to the normal app.

import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useTheme, T } from '../theme/ThemeContext';

interface ResetPasswordPageProps {
  onDone: () => void; // called after successful reset to return to app
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onDone }) => {
  const { dark } = useTheme();
  const tok = T(dark);

  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    // Supabase has already exchanged the token from the URL hash into a
    // session automatically (it does this on createClient init). We just
    // need to call updateUser with the new password.
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);

    // Sign out so the user logs in fresh with their new password
    await supabase.auth.signOut();

    // Clear the hash from the URL so it doesn't re-trigger on refresh
    window.history.replaceState(null, '', window.location.pathname);

    // Give them a moment to read the success message then return to app
    setTimeout(() => onDone(), 2000);
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const page: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: tok.pageBg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Nunito','Helvetica Neue',sans-serif",
    zIndex: 9999,
  };

  const card: React.CSSProperties = {
    width: '100%', maxWidth: '400px',
    background: tok.cardBg,
    border: `1.5px solid ${tok.border}`,
    borderRadius: '16px',
    padding: '36px 32px',
    boxShadow: tok.shadowStrong,
  };

  const label: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 700,
    color: tok.textSecondary, marginBottom: '5px',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '10px 13px',
    borderRadius: '8px', border: `1.5px solid ${tok.border}`,
    background: tok.inputBg, color: tok.textPrimary,
    fontSize: '14px', fontFamily: 'inherit', outline: 'none',
    boxSizing: 'border-box', marginBottom: '14px',
  };

  const btn: React.CSSProperties = {
    width: '100%', padding: '11px',
    borderRadius: '9px', border: 'none',
    background: tok.orange, color: '#fff',
    fontSize: '14px', fontWeight: 700, fontFamily: 'inherit',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    marginTop: '4px',
  };

  const errorBox: React.CSSProperties = {
    padding: '10px 13px', borderRadius: '8px',
    background: tok.redFaint, color: tok.redText,
    fontSize: '13px', marginBottom: '14px',
    border: `1px solid ${tok.red}33`,
  };

  const successBox: React.CSSProperties = {
    padding: '14px', borderRadius: '10px',
    background: tok.greenFaint, color: tok.greenText,
    fontSize: '14px', fontWeight: 700, textAlign: 'center',
    border: `1px solid ${tok.green}44`,
  };

  return (
    <div style={page}>
      <div style={card}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: tok.textPrimary }}>
            Set new password
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: '13px', color: tok.textSecondary }}>
            Choose a new password for your account
          </p>
        </div>

        {success ? (
          <div style={successBox}>
            ✓ Password updated! Redirecting you to sign in…
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div style={errorBox}>{error}</div>}

            <label style={label}>New Password</label>
            <input
              style={input}
              type="password"
              required
              autoFocus
              placeholder="Min 6 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />

            <label style={label}>Confirm Password</label>
            <input
              style={input}
              type="password"
              required
              placeholder="Repeat new password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />

            <button style={btn} type="submit" disabled={loading}>
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};