// src/components/AdminPanel.tsx
// Full-screen admin panel showing all registered users, their settings,
// and admin controls. Only accessible when isAdmin === true.

import React, { useState, useEffect, useCallback } from 'react';
import { useTheme, T } from '../theme/ThemeContext';
import { useAdmin, type UserWithSettings } from '../hooks/useAdmin';

interface AdminPanelProps {
  onClose: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const { dark } = useTheme();
  const tok = T(dark);
  const { getAllUsersWithSettings, setUserAdmin } = useAdmin();

  const [users,     setUsers]     = useState<UserWithSettings[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [search,    setSearch]    = useState('');
  const [togglingAdmin, setTogglingAdmin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getAllUsersWithSettings();
    setUsers(data);
    setLoading(false);
  }, [getAllUsersWithSettings]);

  useEffect(() => { load(); }, [load]);

  const handleToggleAdmin = async (userId: string, current: boolean) => {
    setTogglingAdmin(userId);
    await setUserAdmin(userId, !current);
    await load();
    setTogglingAdmin(null);
  };

  const filtered = users.filter(u =>
    (u.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.nickname ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === selected);

  // ── Styles ────────────────────────────────────────────────────────────────

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9500,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'stretch',
    fontFamily: "'Nunito','Helvetica Neue',sans-serif",
  };

  const panel: React.CSSProperties = {
    width: '100%', maxWidth: '1100px',
    margin: 'auto',
    background: tok.pageBg,
    border: `1.5px solid ${tok.border}`,
    borderRadius: '18px',
    boxShadow: tok.shadowStrong,
    display: 'flex', flexDirection: 'column',
    maxHeight: '90vh',
    overflow: 'hidden',
  };

  const header: React.CSSProperties = {
    padding: '20px 24px',
    borderBottom: `1.5px solid ${tok.border}`,
    display: 'flex', alignItems: 'center', gap: '12px',
    background: tok.cardBg, flexShrink: 0,
  };

  const body: React.CSSProperties = {
    display: 'flex', flex: 1, overflow: 'hidden',
  };

  const sidebar: React.CSSProperties = {
    width: '340px', flexShrink: 0,
    borderRight: `1.5px solid ${tok.border}`,
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    background: tok.panelBg,
  };

  const detail: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '20px 24px',
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={header}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: tok.orangeFaint, border: `1.5px solid ${tok.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🛡️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: tok.textPrimary }}>Admin Panel</div>
            <div style={{ fontSize: 12, color: tok.textMuted }}>{users.length} registered user{users.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${tok.border}`, background: tok.cardBg, color: tok.textSecondary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ↻ Refresh
          </button>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${tok.border}`, background: tok.cardBg, color: tok.textSecondary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ✕ Close
          </button>
        </div>

        <div style={body}>
          {/* User list sidebar */}
          <div style={sidebar}>
            {/* Search */}
            <div style={{ padding: '12px', borderBottom: `1px solid ${tok.borderSubtle}`, flexShrink: 0 }}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search users…"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${tok.border}`, background: tok.inputBg, color: tok.textPrimary, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: tok.textMuted, fontSize: 13 }}>Loading users…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: tok.textMuted, fontSize: 13 }}>No users found</div>
              ) : (
                filtered.map(u => (
                  <div
                    key={u.id}
                    onClick={() => setSelected(u.id === selected ? null : u.id)}
                    style={{
                      padding: '11px 13px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                      border: `1.5px solid ${selected === u.id ? tok.orange : tok.borderSubtle}`,
                      background: selected === u.id ? tok.orangeFaint : tok.cardBg,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Avatar */}
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.is_admin ? tok.orange : tok.purpleFaint, border: `2px solid ${u.is_admin ? tok.orange : tok.purple + '44'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: u.is_admin ? '#fff' : tok.purpleText, flexShrink: 0 }}>
                        {(u.nickname || u.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: tok.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.nickname || u.email?.split('@')[0] || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 11, color: tok.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                      </div>
                      {u.is_admin && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: tok.orangeFaint, color: tok.orange, border: `1px solid ${tok.orange}55`, flexShrink: 0 }}>ADMIN</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Detail panel */}
          <div style={detail}>
            {!selectedUser ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <span style={{ fontSize: 48, opacity: 0.2 }}>👤</span>
                <span style={{ fontSize: 13, color: tok.textMuted }}>Select a user to view details</span>
              </div>
            ) : (
              <UserDetailView tok={tok} user={selectedUser} onToggleAdmin={handleToggleAdmin} togglingAdmin={togglingAdmin} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── UserDetailView ────────────────────────────────────────────────────────────

function UserDetailView({ tok, user, onToggleAdmin, togglingAdmin }: {
  tok: ReturnType<typeof T>;
  user: UserWithSettings;
  onToggleAdmin: (id: string, current: boolean) => void;
  togglingAdmin: string | null;
}) {
  const SETTING_LABELS: Record<string, { label: string; icon: string }> = {
    theme:               { label: 'Theme',          icon: '🎨' },
    baudRate:            { label: 'Baud Rate',       icon: '📡' },
    nickname:            { label: 'Nickname',        icon: '👤' },
    lastConnectedDevice: { label: 'Last Device',     icon: '🔌' },
    totemPoleConfig:     { label: 'Pole Config',     icon: '🗿' },
    pidSettings:         { label: 'PID Settings',    icon: '⚙️' },
    flashHistory:        { label: 'Flash History',   icon: '💾' },
  };

  const formatValue = (key: string, val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (key === 'totemPoleConfig' && Array.isArray(val)) {
      return `${val.length} totem${val.length !== 1 ? 's' : ''} saved`;
    }
    if (key === 'flashHistory' && Array.isArray(val)) {
      return `${val.length} flash operation${val.length !== 1 ? 's' : ''}`;
    }
    if (key === 'baudRate') return `${Number(val).toLocaleString()} baud`;
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const poleConfig = user.settings['totemPoleConfig'] as any[] | undefined;
  const flashHistory = user.settings['flashHistory'] as any[] | undefined;
  const joinedDate = new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* User header card */}
      <div style={{ background: tok.cardBg, border: `1.5px solid ${tok.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: user.is_admin ? tok.orange : tok.purpleFaint, border: `2.5px solid ${user.is_admin ? tok.orange : tok.purple + '44'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: user.is_admin ? '#fff' : tok.purpleText, flexShrink: 0 }}>
          {(user.nickname || user.email || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: tok.textPrimary }}>{user.nickname || user.email?.split('@')[0] || 'Unknown'}</div>
          <div style={{ fontSize: 12, color: tok.textMuted }}>{user.email}</div>
          <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 3 }}>Joined {joinedDate} · ID: <code style={{ fontFamily: "'DM Mono',monospace", fontSize: 10 }}>{user.id.slice(0, 8)}…</code></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {user.is_admin && (
            <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: tok.orangeFaint, color: tok.orange, border: `1px solid ${tok.orange}55` }}>🛡️ ADMIN</span>
          )}
          <button
            onClick={() => onToggleAdmin(user.id, user.is_admin)}
            disabled={togglingAdmin === user.id}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${user.is_admin ? tok.red + '55' : tok.orange + '55'}`,
              background: user.is_admin ? tok.redFaint : tok.orangeFaint,
              color: user.is_admin ? tok.redText : tok.orangeText,
              cursor: togglingAdmin === user.id ? 'not-allowed' : 'pointer',
              opacity: togglingAdmin === user.id ? 0.6 : 1,
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            {togglingAdmin === user.id ? 'Updating…' : user.is_admin ? 'Revoke Admin' : 'Grant Admin'}
          </button>
        </div>
      </div>

      {/* Settings grid */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: tok.orange, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 10 }}>User Settings</div>
        {Object.keys(SETTING_LABELS).length === 0 || Object.keys(user.settings).length === 0 ? (
          <div style={{ padding: '16px', borderRadius: 10, background: tok.cardBg, border: `1.5px solid ${tok.border}`, fontSize: 13, color: tok.textMuted, textAlign: 'center' }}>
            No settings saved yet
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {Object.entries(SETTING_LABELS).map(([key, { label, icon }]) => {
              const val = user.settings[key];
              const hasValue = val !== undefined && val !== null;
              return (
                <div key={key} style={{ background: tok.cardBg, border: `1.5px solid ${hasValue ? tok.border : tok.borderSubtle}`, borderRadius: 10, padding: '12px 14px', opacity: hasValue ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: tok.textSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 13, color: hasValue ? tok.textPrimary : tok.textMuted, fontFamily: (key === 'baudRate' || key === 'lastConnectedDevice') ? "'DM Mono',monospace" : 'inherit', fontWeight: hasValue ? 600 : 400 }}>
                    {formatValue(key, val)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pole config detail */}
      {poleConfig && poleConfig.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: tok.orange, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 10 }}>Saved Pole Layout</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {poleConfig.map((snap: any, i: number) => (
              <div key={snap.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, background: tok.cardBg, border: `1.5px solid ${tok.border}` }}>
                <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: tok.textMuted, minWidth: 20 }}>#{i}</span>
                <span style={{ fontSize: 13, flex: 1, color: tok.textPrimary, fontWeight: 600 }}>{snap.name}</span>
                <span style={{ fontSize: 11, color: tok.textMuted }}>{snap.type}</span>
                <code style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: tok.textMuted }}>S/N: {snap.serialNumber}</code>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flash history detail */}
      {flashHistory && flashHistory.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: tok.orange, letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 10 }}>Recent Flash Operations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flashHistory.slice(-5).reverse().map((entry: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, background: tok.cardBg, border: `1.5px solid ${tok.border}` }}>
                <span style={{ fontSize: 14 }}>{entry.success ? '✅' : '❌'}</span>
                <span style={{ fontSize: 12, flex: 1, color: tok.textPrimary, fontFamily: "'DM Mono',monospace" }}>{entry.fileName}</span>
                <span style={{ fontSize: 11, color: tok.textMuted }}>{new Date(entry.timestamp).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}