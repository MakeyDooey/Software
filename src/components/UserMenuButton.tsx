// src/components/UserMenuButton.tsx
// Inline button (positioned by TopBar).
// - Logged out: opens AuthModal
// - Logged in:  nickname editor, theme status, admin panel link (admins only), sign out

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';
import { useTheme, T } from '../theme/ThemeContext';
import { useUserSettings } from '../hooks/useUserSettings';
import { useAdmin } from '../hooks/useAdmin';
import { AdminPanel } from './AdminPanel';

export const UserMenuButton: React.FC = () => {
  const { user, signOut } = useAuth();
  const { dark } = useTheme();
  const tok = T(dark);
  const { getSetting, setSetting } = useUserSettings();
  const { isAdmin, ensureProfile, syncNickname } = useAdmin();

  const [showModal,    setShowModal]    = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAdmin,    setShowAdmin]    = useState(false);
  const [hover,        setHover]        = useState(false);
  const [nickname,     setNickname]     = useState('');
  const [editingNick,  setEditingNick]  = useState(false);
  const [nickDraft,    setNickDraft]    = useState('');
  const [nickSaved,    setNickSaved]    = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // On login: ensure profile row exists + load nickname
  useEffect(() => {
    if (!user) return;
    ensureProfile();
    getSetting<string>('nickname').then(saved => {
      if (saved) setNickname(saved);
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setEditingNick(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const saveNickname = async () => {
    const trimmed = nickDraft.trim();
    setNickname(trimmed);
    await setSetting('nickname', trimmed);
    await syncNickname(trimmed);   // keep user_profiles in sync
    setEditingNick(false);
    setNickSaved(true);
    setTimeout(() => setNickSaved(false), 1800);
  };

  const base: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '7px',
    padding: '7px 13px', borderRadius: '10px',
    border: `1.5px solid ${tok.border}`,
    fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    transition: 'background 0.15s, box-shadow 0.15s',
    background: hover ? tok.orangeFaint : tok.cardBg,
    color: tok.orangeText,
    boxShadow: hover ? `0 4px 16px ${tok.orangeSubtle}` : tok.shadow,
    whiteSpace: 'nowrap' as const,
  };

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <button style={base} onClick={() => setShowModal(true)}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <span style={{ fontSize: '15px' }}>👤</span>
          <span>Sign in</span>
        </button>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  // ── Logged in ──────────────────────────────────────────────────────────────
  const email        = user.email ?? '';
  const initial      = (nickname || email).charAt(0).toUpperCase();
  const displayLabel = nickname || email.split('@')[0];

  return (
    <>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button style={base} onClick={() => setShowDropdown(d => !d)}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
          <span style={{
            width: '22px', height: '22px', borderRadius: '50%',
            background: isAdmin ? tok.orange : tok.purple,
            color: '#fff', fontSize: '12px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {initial}
          </span>
          <span style={{ maxWidth: '130px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayLabel}
          </span>
          {isAdmin && (
            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: 5, background: tok.orangeFaint, color: tok.orange, border: `1px solid ${tok.orange}44`, fontWeight: 800 }}>
              ADMIN
            </span>
          )}
          <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
        </button>

        {showDropdown && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 3000,
            background: tok.cardBg, border: `1.5px solid ${tok.border}`,
            borderRadius: '12px', boxShadow: tok.shadowStrong,
            minWidth: '250px', overflow: 'hidden',
            fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
          }}>

            {/* Email + role header */}
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${tok.borderSubtle}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '11px', color: tok.textMuted }}>Signed in as</span>
                {isAdmin && (
                  <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: tok.orangeFaint, color: tok.orange, border: `1px solid ${tok.orange}44` }}>
                    🛡️ Admin
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: tok.textSecondary, fontWeight: 700, wordBreak: 'break-all' }}>{email}</div>
            </div>

            {/* Nickname editor */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${tok.borderSubtle}` }}>
              <div style={{ fontSize: '11px', color: tok.textMuted, marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Display Name
              </div>
              {editingNick ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    autoFocus
                    value={nickDraft}
                    onChange={e => setNickDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveNickname();
                      if (e.key === 'Escape') setEditingNick(false);
                    }}
                    placeholder="Your name"
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: '7px',
                      border: `1.5px solid ${tok.border}`,
                      background: tok.inputBg, color: tok.textPrimary,
                      fontSize: '13px', fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                  <button onClick={saveNickname} style={{
                    padding: '6px 12px', borderRadius: '7px', border: 'none',
                    background: tok.orange, color: '#fff',
                    fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Save</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: nickname ? tok.textPrimary : tok.textMuted, fontStyle: nickname ? 'normal' : 'italic' }}>
                    {nickname || 'Not set'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {nickSaved && <span style={{ fontSize: '11px', color: tok.greenText, fontWeight: 700 }}>✓ saved</span>}
                    <button
                      onClick={() => { setNickDraft(nickname); setEditingNick(true); }}
                      style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: `1px solid ${tok.border}`, background: 'transparent', color: tok.orangeText, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}
                    >
                      {nickname ? 'Edit' : 'Set'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Theme indicator */}
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${tok.borderSubtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
              <span style={{ color: tok.textMuted }}>Theme</span>
              <span style={{ color: tok.textSecondary, fontWeight: 700 }}>{dark ? '🌙 Dark' : '☀️ Light'} · synced</span>
            </div>

            {/* Admin panel link — only for admins */}
            {isAdmin && (
              <div
                style={{ padding: '11px 16px', fontSize: '13px', cursor: 'pointer', color: tok.orange, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, transition: 'background 0.1s', borderBottom: `1px solid ${tok.borderSubtle}` }}
                onClick={() => { setShowDropdown(false); setShowAdmin(true); }}
                onMouseEnter={e => (e.currentTarget.style.background = tok.orangeFaint)}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span>🛡️</span> Admin Panel
              </div>
            )}

            {/* Sign out */}
            <div
              style={{ padding: '11px 16px', fontSize: '13px', cursor: 'pointer', color: tok.textPrimary, display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.1s' }}
              onClick={() => { setShowDropdown(false); signOut(); }}
              onMouseEnter={e => (e.currentTarget.style.background = tok.surfaceHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span>🚪</span> Sign out
            </div>
          </div>
        )}
      </div>

      {/* Admin panel modal */}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
    </>
  );
};