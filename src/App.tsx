// src/App.tsx

import React, { useState } from 'react';
import { TotemPoleVisualizer } from './components/TotemPoleVisualizer';
import TotemProgrammingIDE from './components/TotemProgrammingIDE';
import LandingPage from './components/LandingPage';
import { ThemeProvider, useTheme, T } from './theme/ThemeContext';
import type { TotemStatus } from './types/totem';
import './App.css';

// ── Root wraps everything in the provider ──────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

// ── Inner app has access to theme context ──────────────────────────────────

function AppInner() {
  const { dark } = useTheme();
  const [showLanding, setShowLanding] = useState(true);
  const [hasVisited, setHasVisited] = useState(false);
  const [programmingTotem, setProgrammingTotem] = useState<TotemStatus | null>(null);

  const handleEnter = () => { setHasVisited(true); setShowLanding(false); };
  const handleBack  = () => setShowLanding(true);
  const handleProgramSuccess = (id: string) => console.log('Flashed:', id);

  // Apply page background to <body> so no flash of wrong bg-color
  React.useEffect(() => {
    const tok = T(dark);
    document.body.style.background = tok.pageBg;
    document.body.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);

  if (showLanding) {
    return <LandingPage onEnter={handleEnter} hasVisited={hasVisited} />;
  }

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <NavChrome onBack={handleBack} />
      <TotemPoleVisualizer onTotemDoubleClick={(t) => setProgrammingTotem(t)} />
      {programmingTotem && (
        <TotemProgrammingIDE
          totem={programmingTotem}
          onClose={() => setProgrammingTotem(null)}
          onProgramSuccess={handleProgramSuccess}
        />
      )}
    </div>
  );
}

// ── Top-left nav chrome: back + dark toggle ───────────────────────────────

function NavChrome({ onBack }: { onBack: () => void }) {
  const { dark, toggle } = useTheme();
  const tok = T(dark);
  const [hBack, setHBack] = useState(false);
  const [hTheme, setHTheme] = useState(false);

  const base: React.CSSProperties = {
    position: 'fixed', zIndex: 2000,
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px', borderRadius: '10px',
    border: `1.5px solid ${tok.border}`,
    fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
    fontWeight: 700, fontSize: '13px', cursor: 'pointer',
    backdropFilter: 'blur(8px)',
    transition: 'background 0.15s, box-shadow 0.15s',
  };

  return (
    <>
      {/* Back button */}
      <button
        onClick={onBack}
        onMouseEnter={() => setHBack(true)}
        onMouseLeave={() => setHBack(false)}
        style={{
          ...base,
          top: '14px', left: '14px',
          background: hBack ? tok.orangeFaint : tok.cardBg,
          color: tok.orangeText,
          boxShadow: hBack ? `0 4px 16px ${tok.orangeSubtle}` : tok.shadow,
        }}
      >
        <span style={{ fontSize: '14px' }}>←</span>
        <span>Home</span>
      </button>

      {/* Dark mode toggle */}
      <button
        onClick={toggle}
        onMouseEnter={() => setHTheme(true)}
        onMouseLeave={() => setHTheme(false)}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          ...base,
          top: '14px', left: '108px',
          background: hTheme ? tok.orangeFaint : tok.cardBg,
          color: tok.orangeText,
          boxShadow: hTheme ? `0 4px 16px ${tok.orangeSubtle}` : tok.shadow,
          padding: '8px 12px',
          fontSize: '16px',
        }}
      >
        {dark ? '☀️' : '🌙'}
      </button>
    </>
  );
}