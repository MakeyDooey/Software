// src/components/LandingPage.tsx

import React, { useEffect, useState } from 'react';
import { useTheme, T } from '../theme/ThemeContext';

interface LandingPageProps {
  onEnter: () => void;
  hasVisited?: boolean;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter, hasVisited = false }) => {
  const { dark, toggle } = useTheme();
  const tok = T(dark);

  const [mounted, setMounted] = useState(false);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [bootDone, setBootDone] = useState(false);
  const [btnHover, setBtnHover] = useState(false);
  const [resumeHover, setResumeHover] = useState(false);
  const [themeHover, setThemeHover] = useState(false);

  const BOOT_SEQUENCE = [
    '> USB subsystem ready',
    '> Totem registry online',
    '> Flash engine loaded',
    '> Serial monitor active',
    '> All systems go!',
  ];

  useEffect(() => {
    setMounted(true);
    if (hasVisited) { setBootLines(BOOT_SEQUENCE); setBootDone(true); return; }
    let i = 0;
    const iv = setInterval(() => {
      if (i < BOOT_SEQUENCE.length) { setBootLines(p => [...p, BOOT_SEQUENCE[i]]); i++; }
      else { clearInterval(iv); setTimeout(() => setBootDone(true), 200); }
    }, 380);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{ ...s.root, background: tok.pageBg }}>
      {/* Blobs */}
      <div style={{ ...s.blob, width: '400px', height: '400px', background: tok.blobA, top: '-130px', left: '-110px', animationDelay: '0s' }} />
      <div style={{ ...s.blob, width: '320px', height: '320px', background: tok.blobB, top: '-70px', right: '-90px', animationDelay: '4s' }} />
      <div style={{ ...s.blob, width: '480px', height: '480px', background: tok.blobC, bottom: '-170px', left: '50%', transform: 'translateX(-50%)', animationDelay: '7s' }} />

      {/* Dot grid */}
      <svg style={s.dotGrid} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dp" width="32" height="32" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1.2" fill={dark ? 'rgba(235,121,35,0.09)' : 'rgba(180,95,20,0.11)'} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dp)" />
      </svg>

      {/* Theme toggle — top right */}
      <button
        onClick={toggle}
        onMouseEnter={() => setThemeHover(true)}
        onMouseLeave={() => setThemeHover(false)}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed', top: '16px', right: '16px', zIndex: 100,
          padding: '8px 12px', borderRadius: '10px', fontSize: '18px',
          border: `1.5px solid ${tok.border}`,
          background: themeHover ? tok.orangeFaint : tok.cardBg,
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          transition: 'background 0.15s',
          boxShadow: tok.shadow,
        }}
      >
        {dark ? '☀️' : '🌙'}
      </button>

      {/* Card */}
      <div style={{
        ...s.card,
        background: tok.cardBg,
        border: `1.5px solid ${tok.border}`,
        boxShadow: tok.shadowStrong,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(18px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>

        {/* Logo row */}
        <div style={s.logoRow}>
          <div style={{ ...s.logoBox, background: tok.orangeFaint, border: `2px solid ${tok.border}` }}>
            <ChipIcon />
          </div>
          <div style={s.wordmarkCol}>
            <span style={{ ...s.wordmarkName, color: tok.textPrimary }}>MakeyDooey</span>
            <span style={{ ...s.wordmarkTag, color: tok.orange }}>Embedded Development Platform</span>
          </div>
        </div>

        {/* Headline */}
        <div style={s.headlineBlock}>
          <h1 style={{ ...s.headline, color: tok.textPrimary }}>Build. Flash. Monitor.</h1>
          <p style={{ ...s.sub, color: tok.textSecondary }}>
            A visual IDE for makers, robotics teams, and embedded engineers —
            connecting your code to the physical world.
          </p>
        </div>

        {/* Feature pills */}
        <div style={s.pillRow}>
          {[
            { icon: '⚡', label: 'Flash Firmware', bg: tok.amberFaint, border: tok.amber, text: tok.amberText },
            { icon: '📡', label: 'Serial Monitor', bg: tok.greenFaint,  border: tok.green,  text: tok.greenText },
            { icon: '🧱', label: 'Block Sequencer', bg: tok.purpleFaint, border: tok.purple, text: tok.purpleText },
            { icon: '🔧', label: 'ESP32 & STM32',  bg: tok.blueFaint,  border: tok.blue,   text: tok.blueText },
          ].map(({ icon, label, bg, border, text }) => (
            <span key={label} style={{
              ...s.pill,
              background: bg,
              borderColor: `${border}55`,
              color: text,
            }}>
              <span style={{ fontSize: '13px' }}>{icon}</span>
              {label}
            </span>
          ))}
        </div>

        {/* Terminal */}
        <div style={{ ...s.terminal, background: tok.termBg, border: `1.5px solid ${tok.termBorder}` }}>
          <div style={{ ...s.termBar, background: tok.termHeaderBg, borderBottom: `1px solid ${tok.termBorder}` }}>
            <span style={{ ...s.dot, background: '#ff6b6b' }} />
            <span style={{ ...s.dot, background: '#ffd93d' }} />
            <span style={{ ...s.dot, background: '#6bcb77' }} />
            <span style={{ ...s.termTitle, color: '#c4906a' }}>system init</span>
          </div>
          <div style={s.termBody}>
            {bootLines.map((line, i) => (
              <div key={i} style={{
                ...s.termLine,
                color: (i === bootLines.length - 1 && bootDone) ? '#22c55e' : '#92400e',
              }}>
                {line}
              </div>
            ))}
            {!bootDone && <span style={{ ...s.cursor, color: tok.orange }}>▋</span>}
          </div>
        </div>

        {/* CTA buttons */}
        <div style={s.ctaRow}>
          <button
            style={{
              ...s.cta,
              flex: hasVisited ? 1 : undefined,
              opacity: bootDone ? 1 : 0.38,
              background: btnHover && bootDone ? tok.orangeHover : tok.orange,
              boxShadow: btnHover && bootDone ? `0 8px 28px ${tok.orangeSubtle}` : `0 4px 18px ${tok.orangeSubtle}`,
              transform: bootDone ? (btnHover ? 'scale(1.03)' : 'scale(1)') : 'scale(0.97)',
              cursor: bootDone ? 'pointer' : 'default',
              transition: 'opacity 0.4s, transform 0.2s, background 0.15s, box-shadow 0.15s',
            }}
            onClick={onEnter}
            disabled={!bootDone}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
          >
            {hasVisited ? '← Back to IDE' : 'Launch IDE →'}
          </button>

          {hasVisited && (
            <button
              style={{
                ...s.resumeBtn,
                background: resumeHover ? tok.orangeFaint : 'transparent',
                border: `1.5px solid ${resumeHover ? tok.borderStrong : tok.border}`,
                color: tok.orangeText,
                transform: resumeHover ? 'scale(1.03)' : 'scale(1)',
              }}
              onClick={onEnter}
              onMouseEnter={() => setResumeHover(true)}
              onMouseLeave={() => setResumeHover(false)}
            >
              Open IDE
            </button>
          )}
        </div>

        <span style={{ ...s.versionLine, color: tok.textMuted }}>FR3 · Senior Capstone 2025–26</span>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=DM+Mono:wght@400;500&display=swap');
        @keyframes blobFloat {
          0%,100%{transform:translate(0,0) scale(1)} 40%{transform:translate(18px,-16px) scale(1.05)} 70%{transform:translate(-12px,10px) scale(0.97)}
        }
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes fadeInLine{from{opacity:0;transform:translateX(-5px)}to{opacity:1;transform:translateX(0)}}
      `}</style>
    </div>
  );
};

const ChipIcon = () => (
  <svg viewBox="0 0 80 80" width="62" height="62" xmlns="http://www.w3.org/2000/svg">
    <rect x="14" y="14" width="52" height="52" rx="10" fill="#EB7923" />
    <rect x="20" y="20" width="40" height="40" rx="7" fill="#2d0e4e" />
    <circle cx="40" cy="36" r="9" fill="#EB7923" />
    <circle cx="40" cy="36" r="5" fill="#2d0e4e" />
    <path d="M31 50 Q40 57 49 50" stroke="#EB7923" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    {[26,34,42,50,58].map(y => (
      <React.Fragment key={y}>
        <rect x="6"  y={y-2.5} width="8" height="5" rx="1.5" fill="#EB7923" />
        <rect x="66" y={y-2.5} width="8" height="5" rx="1.5" fill="#EB7923" />
      </React.Fragment>
    ))}
    {[26,34,42,50,58].map(x => (
      <React.Fragment key={x}>
        <rect x={x-2.5} y="6"  width="5" height="8" rx="1.5" fill="#EB7923" />
        <rect x={x-2.5} y="66" width="5" height="8" rx="1.5" fill="#EB7923" />
      </React.Fragment>
    ))}
  </svg>
);

// ── Static layout styles (colors come from tokens above) ──────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', fontFamily: "'Nunito','Helvetica Neue',sans-serif", zIndex: 9999,
  },
  blob: {
    position: 'absolute', borderRadius: '50%', filter: 'blur(72px)',
    pointerEvents: 'none', animation: 'blobFloat 12s ease-in-out infinite',
  },
  dotGrid: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
  card: {
    position: 'relative', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '26px', padding: '44px 48px 36px', maxWidth: '560px', width: '90%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '22px', zIndex: 1,
  },
  logoRow: { display: 'flex', alignItems: 'center', gap: '18px' },
  logoBox: {
    borderRadius: '18px', padding: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 14px rgba(235,121,35,0.14)',
  },
  wordmarkCol: { display: 'flex', flexDirection: 'column', gap: '4px' },
  wordmarkName: { fontFamily: "'Nunito',sans-serif", fontWeight: 900, fontSize: '36px', letterSpacing: '-0.5px', lineHeight: 1 },
  wordmarkTag:  { fontFamily: "'DM Mono',monospace", fontSize: '11px', letterSpacing: '1.8px', textTransform: 'uppercase' as const },
  headlineBlock: { textAlign: 'center' as const, display: 'flex', flexDirection: 'column' as const, gap: '10px', alignItems: 'center' },
  headline: { fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: '28px', margin: 0, letterSpacing: '-0.3px' },
  sub:      { fontSize: '14px', lineHeight: '1.65', margin: 0, maxWidth: '420px', textAlign: 'center' as const },
  pillRow:  { display: 'flex', flexWrap: 'wrap' as const, gap: '8px', justifyContent: 'center' },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '6px 14px', borderRadius: '20px', border: '1.5px solid',
    fontSize: '12px', fontWeight: 700, letterSpacing: '0.2px',
  },
  terminal: { width: '100%', borderRadius: '14px', overflow: 'hidden' },
  termBar:  { display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px' },
  dot:      { width: '10px', height: '10px', borderRadius: '50%', display: 'block', flexShrink: 0 },
  termTitle: { marginLeft: '6px', fontFamily: "'DM Mono',monospace", fontSize: '11px', letterSpacing: '1px' },
  termBody: {
    padding: '14px 18px', minHeight: '108px',
    display: 'flex', flexDirection: 'column' as const, gap: '4px',
  },
  termLine: { fontFamily: "'DM Mono',monospace", fontSize: '12px', animation: 'fadeInLine 0.22s ease both', letterSpacing: '0.1px' },
  cursor:   { fontFamily: "'DM Mono',monospace", fontSize: '13px', animation: 'blink 1s step-end infinite', marginTop: '2px' },
  ctaRow:   { display: 'flex', gap: '10px', width: '100%', justifyContent: 'center' },
  cta: {
    padding: '14px 48px', border: 'none', borderRadius: '13px', color: '#fff',
    fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '0.2px',
  },
  resumeBtn: {
    padding: '14px 24px', borderRadius: '13px',
    fontFamily: "'Nunito',sans-serif", fontWeight: 700, fontSize: '15px', cursor: 'pointer',
    transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
  },
  versionLine: { fontFamily: "'DM Mono',monospace", fontSize: '11px', letterSpacing: '1px' },
};

export default LandingPage;