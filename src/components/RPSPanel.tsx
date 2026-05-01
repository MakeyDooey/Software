// src/components/RPSPanel.tsx
// Rock Paper Scissors game panel for the MTL (Main Totem Layer) monitor tab.
// Replaces BenjiPanel when an MTL-type totem is opened.
//
// SERIAL PROTOCOL (placeholder — wire to real firmware when ready):
//   TX to SL: 2-byte packet  [MODE_BYTE, COMMAND_BYTE]
//     MODE_BYTE:    0x00 = passthrough (not programming), 0x01 = programming
//     COMMAND_BYTE: 0x72 ('r') = rock, 0x70 ('p') = paper, 0x73 ('s') = scissors
//   RX from SL:  JSON line   {"result":"win"|"lose"|"draw","user":"r"|"p"|"s","opponent":"r"|"p"|"s"}
//
// The MODE_BYTE tells SL to route the packet down the bus without programming any board.
// Swap the TODO sections below when Leo/Dom finalize the packet spec.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme, T } from '../theme/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type Move = 'r' | 'p' | 's';
type GameResult = 'win' | 'lose' | 'draw' | null;

interface RPSPanelProps {
  /** Already-open writer ref from the parent IDE (raw byte writer, no delay, no line endings) */
  writer: WritableStreamDefaultWriter<Uint8Array> | null;
  /** Setter to append text to the shared serial terminal in the parent */
  appendToTerminal: (text: string) => void;
  /** Raw terminal output string (for the read-only terminal display) */
  termOutput: string;
  /** Whether serial is connected */
  isConnected: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// TODO: Confirm MODE_BYTE value with Dom/Leo — 0x00 = passthrough intent
const PASSTHROUGH_MODE_BYTE = 0x00;

const MOVE_CONFIG: Record<Move, { label: string; emoji: string; description: string; keyLabel: string }> = {
  r: { label: 'Rock',     emoji: '✊', description: 'Fist closed',    keyLabel: 'R' },
  p: { label: 'Paper',    emoji: '🖐',  description: 'Hand open',      keyLabel: 'P' },
  s: { label: 'Scissors', emoji: '✌️',  description: 'Peace sign',     keyLabel: 'S' },
};

const RESULT_CONFIG: Record<NonNullable<GameResult>, { label: string; color: string; emoji: string }> = {
  win:  { label: 'You Win!',   color: '#22c55e', emoji: '🏆' },
  lose: { label: 'You Lose',   color: '#ef4444', emoji: '💀' },
  draw: { label: 'Draw!',      color: '#f59e0b', emoji: '🤝' },
};

// ─── Component ────────────────────────────────────────────────────────────────

const RPSPanel: React.FC<RPSPanelProps> = ({
  writer,
  appendToTerminal,
  termOutput,
  isConnected,
}) => {
  const { dark } = useTheme();
  const tok = T(dark);
  const terminalRef = useRef<HTMLDivElement>(null);

  const [lastMove,       setLastMove]       = useState<Move | null>(null);
  const [gameResult,     setGameResult]     = useState<GameResult>(null);
  const [opponentMove,   setOpponentMove]   = useState<Move | null>(null);
  const [resultAnim,     setResultAnim]     = useState(false);
  const [moveAnim,       setMoveAnim]       = useState<Move | null>(null);
  const [score,          setScore]          = useState({ wins: 0, losses: 0, draws: 0 });
  const [roundCount,     setRoundCount]     = useState(0);
  const [lastRxLine,     setLastRxLine]     = useState<string>('');

  // ── Auto-scroll terminal ──────────────────────────────────────────────────

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [termOutput]);

  // ── Parse incoming serial lines for game result ───────────────────────────
  // TODO: Adjust JSON key names when Leo/Dom finalize the MTL→SL→PWA result packet.
  // Expected shape: {"result":"win","user":"r","opponent":"s"}

  useEffect(() => {
    // Grab the last line of the terminal output to check for new JSON
    const lines = termOutput.trim().split('\n');
    const lastLine = lines[lines.length - 1]?.trim() ?? '';
    if (lastLine === lastRxLine || !lastLine.startsWith('{')) return;
    setLastRxLine(lastLine);

    try {
      const parsed = JSON.parse(lastLine);
      const result  = parsed.result  as GameResult;
      const opponent = parsed.opponent as Move;

      if (result && (result === 'win' || result === 'lose' || result === 'draw')) {
        setGameResult(result);
        setOpponentMove(opponent ?? null);
        setRoundCount(c => c + 1);
        setScore(s => ({
          wins:   s.wins   + (result === 'win'  ? 1 : 0),
          losses: s.losses + (result === 'lose' ? 1 : 0),
          draws:  s.draws  + (result === 'draw' ? 1 : 0),
        }));
        // Trigger result animation
        setResultAnim(false);
        requestAnimationFrame(() => setResultAnim(true));
      }
    } catch {
      // Not JSON — fine, it's a debug line
    }
  }, [termOutput, lastRxLine]);

  // ── Send move ─────────────────────────────────────────────────────────────

  const sendMove = useCallback(async (move: Move) => {
    if (!isConnected || !writer) return;

    setLastMove(move);
    setGameResult(null);
    setOpponentMove(null);
    setMoveAnim(move);
    setTimeout(() => setMoveAnim(null), 300);

    // TODO: Swap this block for the finalized packet format from Dom/Leo.
    // Current structure: [PASSTHROUGH_MODE_BYTE, ASCII_COMMAND_BYTE]
    const packet = new Uint8Array([
      PASSTHROUGH_MODE_BYTE,
      move.charCodeAt(0),
    ]);

    try {
      await writer.write(packet);
      appendToTerminal(`[TX] Passthrough packet → [0x${PASSTHROUGH_MODE_BYTE.toString(16).padStart(2,'0')}, '${move}' (0x${move.charCodeAt(0).toString(16)})]\n`);
    } catch (e: any) {
      appendToTerminal(`[TX ERROR] ${e.message}\n`);
    }
  }, [isConnected, writer, appendToTerminal]);

  // ── Keyboard handler ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'r' || k === 'p' || k === 's') {
        e.preventDefault();
        sendMove(k as Move);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [sendMove]);

  // ── Sub-components ────────────────────────────────────────────────────────

  const MoveButton = ({ move }: { move: Move }) => {
    const cfg = MOVE_CONFIG[move];
    const isActive = lastMove === move;
    const isAnimating = moveAnim === move;

    return (
      <button
        onClick={() => sendMove(move)}
        disabled={!isConnected}
        style={{
          position: 'relative',
          flex: 1,
          padding: '20px 12px',
          border: `2px solid ${isActive ? tok.orange : tok.border}`,
          borderRadius: '14px',
          background: isActive
            ? tok.orangeFaint
            : dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)',
          cursor: isConnected ? 'pointer' : 'not-allowed',
          opacity: isConnected ? 1 : 0.45,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          transition: 'all 0.15s ease',
          transform: isAnimating ? 'scale(0.93)' : 'scale(1)',
          boxShadow: isActive
            ? `0 0 0 3px ${tok.orangeSubtle}, 0 4px 16px ${tok.orangeSubtle}`
            : 'none',
        }}
      >
        {/* Keyboard shortcut badge */}
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '10px',
          fontSize: '10px',
          fontFamily: "'DM Mono', monospace",
          fontWeight: 700,
          color: tok.textMuted,
          background: tok.borderSubtle,
          borderRadius: '4px',
          padding: '1px 5px',
          letterSpacing: '0.5px',
        }}>
          {cfg.keyLabel}
        </div>

        <span style={{ fontSize: '36px', lineHeight: 1 }}>{cfg.emoji}</span>
        <span style={{
          fontSize: '13px',
          fontWeight: 800,
          color: isActive ? tok.orange : tok.textPrimary,
          fontFamily: "'Nunito', sans-serif",
        }}>
          {cfg.label}
        </span>
        <span style={{
          fontSize: '10px',
          color: tok.textMuted,
          fontFamily: "'DM Mono', monospace",
        }}>
          {cfg.description}
        </span>
      </button>
    );
  };

  const ResultPanel = () => {
    if (!gameResult || !lastMove) return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: tok.textMuted,
        fontFamily: "'DM Mono', monospace",
        fontSize: '12px',
      }}>
        <div style={{ fontSize: '32px', opacity: 0.3 }}>⏳</div>
        <div>Waiting for result...</div>
        <div style={{ fontSize: '10px', opacity: 0.6 }}>
          MTL camera will detect opponent's move
        </div>
      </div>
    );

    const resCfg = RESULT_CONFIG[gameResult];

    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        animation: resultAnim ? 'rps-pop 0.35s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
      }}>
        {/* Result banner */}
        <div style={{
          padding: '10px 28px',
          borderRadius: '999px',
          background: `${resCfg.color}22`,
          border: `2px solid ${resCfg.color}66`,
          color: resCfg.color,
          fontSize: '22px',
          fontWeight: 900,
          fontFamily: "'Nunito', sans-serif",
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span>{resCfg.emoji}</span>
          <span>{resCfg.label}</span>
        </div>

        {/* Move comparison */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: "'Nunito', sans-serif",
        }}>
          {/* User */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: tok.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>You</div>
            <div style={{ fontSize: '28px' }}>{MOVE_CONFIG[lastMove].emoji}</div>
            <div style={{ fontSize: '11px', color: tok.textSecondary, fontWeight: 700 }}>{MOVE_CONFIG[lastMove].label}</div>
          </div>

          {/* VS */}
          <div style={{ fontSize: '14px', color: tok.textMuted, fontWeight: 900, padding: '0 4px' }}>VS</div>

          {/* Opponent */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: tok.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Camera</div>
            <div style={{ fontSize: '28px' }}>
              {opponentMove ? MOVE_CONFIG[opponentMove].emoji : '🎥'}
            </div>
            <div style={{ fontSize: '11px', color: tok.textSecondary, fontWeight: 700 }}>
              {opponentMove ? MOVE_CONFIG[opponentMove].label : 'Detecting...'}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ── Scoreboard ────────────────────────────────────────────────────────────

  const Scoreboard = () => (
    <div style={{
      display: 'flex',
      gap: '8px',
      padding: '8px 12px',
      background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.6)',
      border: `1.5px solid ${tok.border}`,
      borderRadius: '10px',
    }}>
      {[
        { label: 'W', value: score.wins,   color: tok.green   },
        { label: 'L', value: score.losses, color: tok.red     },
        { label: 'D', value: score.draws,  color: tok.amber   },
        { label: 'Rnd', value: roundCount, color: tok.blueText },
      ].map(({ label, value, color }) => (
        <div key={label} style={{ textAlign: 'center', minWidth: '36px' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color, fontFamily: "'DM Mono', monospace" }}>{value}</div>
          <div style={{ fontSize: '9px', color: tok.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
        </div>
      ))}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Keyframe injection */}
      <style>{`
        @keyframes rps-pop {
          0%   { transform: scale(0.8); opacity: 0; }
          60%  { transform: scale(1.06); }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>

      <div style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        gap: '0',
      }}>

        {/* ── LEFT: Game Panel ──────────────────────────────────────────────── */}
        <div style={{
          width: '340px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1.5px solid ${tok.border}`,
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '12px 16px',
            background: tok.panelHeaderBg,
            borderBottom: `1.5px solid ${tok.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div>
              <div style={{
                fontSize: '11px',
                fontWeight: 800,
                color: tok.orange,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontFamily: "'Nunito', sans-serif",
              }}>
                🎮 RPS Game
              </div>
              <div style={{ fontSize: '10px', color: tok.textMuted, fontFamily: "'DM Mono', monospace" }}>
                MTL Passthrough Mode
              </div>
            </div>
            <Scoreboard />
          </div>

          {/* Connection warning */}
          {!isConnected && (
            <div style={{
              padding: '8px 14px',
              background: tok.amberFaint,
              borderBottom: `1px solid ${tok.amber}44`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              color: tok.amberText,
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 700,
            }}>
              ⚠️ Connect to ShamanLink to play
            </div>
          )}

          {/* Move buttons */}
          <div style={{ padding: '16px', display: 'flex', gap: '10px' }}>
            <MoveButton move="r" />
            <MoveButton move="p" />
            <MoveButton move="s" />
          </div>

          {/* Keyboard hint */}
          <div style={{
            padding: '0 16px 8px',
            fontSize: '10px',
            color: tok.textMuted,
            fontFamily: "'DM Mono', monospace",
            textAlign: 'center',
          }}>
            Press R / P / S keys to play
          </div>

          {/* Result area */}
          <div style={{
            flex: 1,
            margin: '0 12px 12px',
            padding: '12px',
            background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.5)',
            border: `1.5px solid ${tok.borderSubtle}`,
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Result section label */}
            <div style={{
              fontSize: '9px',
              fontWeight: 800,
              color: tok.textMuted,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '8px',
              fontFamily: "'Nunito', sans-serif",
            }}>
              Round Result
            </div>
            <ResultPanel />
          </div>

          {/* Packet info footer */}
          <div style={{
            padding: '8px 14px',
            background: tok.purpleFaint,
            borderTop: `1px solid ${tok.purple}33`,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            <div style={{ fontSize: '9px', color: tok.purpleText, fontFamily: "'DM Mono', monospace", fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              TX Packet Format (passthrough)
            </div>
            <div style={{ fontSize: '10px', color: tok.textMuted, fontFamily: "'DM Mono', monospace" }}>
              {/* TODO: Update label when packet spec finalized */}
              [0x{PASSTHROUGH_MODE_BYTE.toString(16).padStart(2,'0')} MODE] [CMD]  →  SL  →  MTL  →  MT
            </div>
          </div>
        </div>

        {/* ── RIGHT: Raw Serial Terminal ─────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: tok.termBg,
        }}>

          {/* Terminal header */}
          <div style={{
            padding: '10px 16px',
            background: tok.termHeaderBg,
            borderBottom: `1px solid ${tok.termBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: isConnected ? '#22c55e' : '#6b7280',
                boxShadow: isConnected ? '0 0 6px #22c55e' : 'none',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                color: tok.termText,
                fontFamily: "'DM Mono', monospace",
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}>
                Serial Monitor  ·  ShamanLink
              </span>
            </div>
            <div style={{
              fontSize: '9px',
              color: '#6b7280',
              fontFamily: "'DM Mono', monospace",
            }}>
              read-only · RX from SL bus
            </div>
          </div>

          {/* Terminal output */}
          <div
            ref={terminalRef}
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '12px 16px',
              fontFamily: "'DM Mono', 'Consolas', monospace",
              fontSize: '12px',
              lineHeight: '1.6',
              color: tok.termText,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {termOutput || (
              <span style={{ color: '#4b5563' }}>
                {isConnected
                  ? '// Connected — press R, P, or S to begin\n'
                  : '// Waiting for serial connection to ShamanLink...\n'}
              </span>
            )}
          </div>

          {/* Terminal footer — shows last received line */}
          {lastRxLine && (
            <div style={{
              padding: '6px 14px',
              background: tok.termHeaderBg,
              borderTop: `1px solid ${tok.termBorder}`,
              fontSize: '10px',
              color: '#6b7280',
              fontFamily: "'DM Mono', monospace",
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexShrink: 0,
            }}>
              last line: {lastRxLine}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RPSPanel;