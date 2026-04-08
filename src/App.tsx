// src/App.tsx

import React, { useState, useEffect } from 'react';
import { TotemPoleVisualizer } from './components/TotemPoleVisualizer';
import TotemProgrammingIDE from './components/TotemProgrammingIDE';
import LandingPage from './components/LandingPage';
import { TopBar } from './components/TopBar';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { ThemeProvider, useTheme, T } from './theme/ThemeContext';
import { useAuth } from './context/AuthContext';
import { useUserSettings } from './hooks/useUserSettings';
import type { TotemStatus } from './types/totem';
import './App.css';

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function ThemeSync() {
  const { user } = useAuth();
  const { dark, setDark } = useTheme();
  const { getSetting, setSetting } = useUserSettings();

  useEffect(() => {
    if (!user) return;
    getSetting<'dark' | 'light'>('theme').then(saved => {
      if (saved === 'dark'  && !dark) setDark(true);
      if (saved === 'light' && dark)  setDark(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    setSetting('theme', dark ? 'dark' : 'light');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, user?.id]);

  return null;
}

function AppInner() {
  const { dark } = useTheme();
  const [showLanding,      setShowLanding]      = useState(true);
  const [hasVisited,       setHasVisited]        = useState(false);
  const [programmingTotem, setProgrammingTotem] = useState<TotemStatus | null>(null);
  const [isPasswordReset,  setIsPasswordReset]  = useState(false);
  // Lifted from TotemPoleVisualizer so TotemProgrammingIDE can know about demo mode
  const [isDemoMode,       setIsDemoMode]        = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes('type=recovery') && hash.includes('access_token')) {
      setIsPasswordReset(true);
    }
  }, []);

  useEffect(() => {
    const tok = T(dark);
    document.body.style.background  = tok.pageBg;
    document.body.style.colorScheme = dark ? 'dark' : 'light';
  }, [dark]);

  const handleEnter = () => { setHasVisited(true); setShowLanding(false); };
  const handleBack  = () => setShowLanding(true);

  if (isPasswordReset) {
    return (
      <>
        <ThemeSync />
        <ResetPasswordPage onDone={() => {
          setIsPasswordReset(false);
          setShowLanding(true);
        }} />
      </>
    );
  }

  return (
    <>
      <ThemeSync />
      <TopBar />
      {showLanding ? (
        <LandingPage onEnter={handleEnter} hasVisited={hasVisited} />
      ) : (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
          <NavBack onBack={handleBack} />
          <TotemPoleVisualizer
            onTotemDoubleClick={(t) => setProgrammingTotem(t)}
            onDemoModeChange={setIsDemoMode}
          />
          {programmingTotem && (
            <TotemProgrammingIDE
              totem={programmingTotem}
              onClose={() => setProgrammingTotem(null)}
              onProgramSuccess={(id) => console.log('Flashed:', id)}
            />
          )}
        </div>
      )}
    </>
  );
}

function NavBack({ onBack }: { onBack: () => void }) {
  const { dark } = useTheme();
  const tok = T(dark);
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onBack}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'fixed', zIndex: 2000, top: '14px', left: '14px',
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '8px 14px', borderRadius: '10px',
        border: `1.5px solid ${tok.border}`,
        fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
        fontWeight: 700, fontSize: '13px', cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        transition: 'background 0.15s, box-shadow 0.15s',
        background: hover ? tok.orangeFaint : tok.cardBg,
        color: tok.orangeText,
        boxShadow: hover ? `0 4px 16px ${tok.orangeSubtle}` : tok.shadow,
      }}
    >
      <span style={{ fontSize: '14px' }}>←</span>
      <span>Home</span>
    </button>
  );
}