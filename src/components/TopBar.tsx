// src/components/TopBar.tsx
// Fixed top-right bar that holds the theme toggle and user menu button
// side-by-side. Used on BOTH the landing page and the IDE screen so the
// buttons are always in the same place and never overlap anything.

import React, { useState } from 'react';
import { useTheme, T } from '../theme/ThemeContext';
import { UserMenuButton } from './UserMenuButton';

export const TopBar: React.FC = () => {
  const { dark, toggle } = useTheme();
  const tok = T(dark);
  const [hTheme, setHTheme] = useState(false);

  return (
    <div style={{
      position: 'fixed',
      top: '14px',
      right: '14px',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}>
      {/* User menu — sign in / avatar */}
      <UserMenuButton />

      {/* Theme toggle — always rightmost */}
      <button
        onClick={toggle}
        onMouseEnter={() => setHTheme(true)}
        onMouseLeave={() => setHTheme(false)}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px 12px', borderRadius: '10px', fontSize: '16px',
          border: `1.5px solid ${tok.border}`,
          background: hTheme ? tok.orangeFaint : tok.cardBg,
          color: tok.orangeText,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'background 0.15s, box-shadow 0.15s',
          boxShadow: hTheme ? `0 4px 16px ${tok.orangeSubtle}` : tok.shadow,
          fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
          fontWeight: 700,
        }}
      >
        {dark ? '☀️' : '🌙'}
      </button>
    </div>
  );
};