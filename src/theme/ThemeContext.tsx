// src/theme/ThemeContext.tsx
// Central theme system for MakeyDooey light/dark mode

import React, { createContext, useContext, useState, useCallback } from 'react';

// ─── Context ─────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  dark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({ dark: false, toggle: () => {} });

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('md-theme') === 'dark'; } catch { return false; }
  });
  const toggle = useCallback(() => {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem('md-theme', next ? 'dark' : 'light'); } catch {}
      return next;
    });
  }, []);
  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);

// ─── Token factory ────────────────────────────────────────────────────────────
// Call T(dark) to get a full palette object. Every color in the app comes from here.

export interface Tokens {
  // Page / surfaces
  pageBg: string;
  cardBg: string;
  cardBgAlt: string;       // slightly darker card
  panelBg: string;         // sidebar / panel
  panelHeaderBg: string;
  surfaceHover: string;
  inputBg: string;

  // Borders
  border: string;          // standard
  borderStrong: string;    // emphasis
  borderSubtle: string;    // hairline

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnOrange: string;    // always white

  // Brand orange
  orange: string;
  orangeHover: string;
  orangeFaint: string;     // very light tint
  orangeSubtle: string;    // border / pill bg
  orangeText: string;      // text on light bg

  // Status
  green: string;
  greenFaint: string;
  greenText: string;
  red: string;
  redFaint: string;
  redText: string;
  amber: string;
  amberFaint: string;
  amberText: string;
  blue: string;
  blueFaint: string;
  blueText: string;
  purple: string;
  purpleFaint: string;
  purpleText: string;

  // Terminal (always dark)
  termBg: string;
  termText: string;
  termInputBg: string;
  termBorder: string;
  termHeaderBg: string;

  // Blobs (landing page)
  blobA: string;
  blobB: string;
  blobC: string;

  // Misc
  scrollThumb: string;
  backdropBlur: string;
  shadow: string;
  shadowStrong: string;
}

export function T(dark: boolean): Tokens {
  if (dark) return {
    pageBg:           '#1a0e2e',
    cardBg:           'rgba(38,22,58,0.92)',
    cardBgAlt:        'rgba(28,16,46,0.95)',
    panelBg:          'rgba(32,18,52,0.88)',
    panelHeaderBg:    'rgba(42,26,64,0.8)',
    surfaceHover:     'rgba(235,121,35,0.1)',
    inputBg:          'rgba(255,255,255,0.06)',

    border:           'rgba(235,121,35,0.22)',
    borderStrong:     'rgba(235,121,35,0.4)',
    borderSubtle:     'rgba(235,121,35,0.12)',

    textPrimary:      '#f5ede0',
    textSecondary:    '#c4a882',
    textMuted:        '#7a6458',
    textOnOrange:     '#fff',

    orange:           '#EB7923',
    orangeHover:      '#c85e0a',
    orangeFaint:      'rgba(235,121,35,0.12)',
    orangeSubtle:     'rgba(235,121,35,0.2)',
    orangeText:       '#f5ede0',

    green:            '#22c55e',
    greenFaint:       'rgba(34,197,94,0.12)',
    greenText:        '#bbf7d0',
    red:              '#ef4444',
    redFaint:         'rgba(239,68,68,0.12)',
    redText:          '#fecaca',
    amber:            '#f59e0b',
    amberFaint:       'rgba(245,158,11,0.12)',
    amberText:        '#fde68a',
    blue:             '#3b82f6',
    blueFaint:        'rgba(59,130,246,0.12)',
    blueText:         '#bfdbfe',
    purple:           '#a855f7',
    purpleFaint:      'rgba(168,85,247,0.12)',
    purpleText:       '#e9d5ff',

    termBg:           '#0d0818',
    termText:         '#a3e635',
    termInputBg:      'rgba(255,255,255,0.04)',
    termBorder:       'rgba(235,121,35,0.2)',
    termHeaderBg:     'rgba(255,255,255,0.04)',

    blobA:            'rgba(235,121,35,0.14)',
    blobB:            'rgba(140,80,255,0.12)',
    blobC:            'rgba(200,120,20,0.1)',

    scrollThumb:      'rgba(235,121,35,0.3)',
    backdropBlur:     'rgba(26,14,46,0.7)',
    shadow:           '0 4px 24px rgba(0,0,0,0.4)',
    shadowStrong:     '0 8px 40px rgba(0,0,0,0.6)',
  };

  // Light
  return {
    pageBg:           '#fdf6ee',
    cardBg:           'rgba(255,255,255,0.87)',
    cardBgAlt:        'rgba(255,252,248,0.95)',
    panelBg:          'rgba(255,255,255,0.75)',
    panelHeaderBg:    'rgba(255,247,238,0.7)',
    surfaceHover:     '#fff7ee',
    inputBg:          '#fff',

    border:           'rgba(235,121,35,0.22)',
    borderStrong:     'rgba(235,121,35,0.4)',
    borderSubtle:     'rgba(235,121,35,0.12)',

    textPrimary:      '#1a0a30',
    textSecondary:    '#6b5444',
    textMuted:        '#9ca3af',
    textOnOrange:     '#fff',

    orange:           '#EB7923',
    orangeHover:      '#c85e0a',
    orangeFaint:      '#fff3e0',
    orangeSubtle:     'rgba(235,121,35,0.2)',
    orangeText:       '#92400e',

    green:            '#16a34a',
    greenFaint:       '#dcfce7',
    greenText:        '#14532d',
    red:              '#dc2626',
    redFaint:         '#fef2f2',
    redText:          '#991b1b',
    amber:            '#d97706',
    amberFaint:       '#fef3c7',
    amberText:        '#92400e',
    blue:             '#2563eb',
    blueFaint:        '#dbeafe',
    blueText:         '#1e3a8a',
    purple:           '#7c3aed',
    purpleFaint:      '#ede9fe',
    purpleText:       '#4c1d95',

    termBg:           '#1a0a30',
    termText:         '#a3e635',
    termInputBg:      'rgba(255,255,255,0.05)',
    termBorder:       'rgba(235,121,35,0.25)',
    termHeaderBg:     'rgba(255,255,255,0.06)',

    blobA:            'rgba(235,121,35,0.2)',
    blobB:            'rgba(180,130,255,0.18)',
    blobC:            'rgba(255,215,120,0.2)',

    scrollThumb:      'rgba(235,121,35,0.28)',
    backdropBlur:     'blur(18px)',
    shadow:           '0 8px 48px rgba(180,80,10,0.1)',
    shadowStrong:     '0 4px 20px rgba(180,80,10,0.15)',
  };
}