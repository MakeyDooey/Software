// src/components/TotemPoleVisualizer.tsx
// Themed with MakeyDooey light/dark token system

import React, { useState, useEffect } from 'react';
import type { TotemStatus, PowerState } from '../types/totem';
import usbService from '../services/usbService';
import demoModeService from '../services/platform/demoModeService';
import { useTheme, T, type Tokens } from '../theme/ThemeContext';

interface TotemPoleVisualizerProps {
  onTotemDoubleClick: (totem: TotemStatus) => void;
}

export const TotemPoleVisualizer: React.FC<TotemPoleVisualizerProps> = ({ onTotemDoubleClick }) => {
  const { dark } = useTheme();
  const tok = T(dark);

  const [connectedTotems, setConnectedTotems] = useState<TotemStatus[]>([]);
  const [totemPole, setTotemPole] = useState<TotemStatus[]>([]);
  const [selectedTotem, setSelectedTotem] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const unsub = usbService.subscribe((event) => {
      if (event.action === 'connected') {
        setConnectedTotems(p => [...p, event.totem]);
      } else {
        setConnectedTotems(p => p.filter(t => t.id !== event.totem.id));
        setTotemPole(p => p.map(t => t.id === event.totem.id ? { ...t, connected: false } : t));
      }
    });
    return () => unsub();
  }, []);

  const startUSBMonitoring = async () => {
    try {
      const granted = await usbService.requestPermission();
      if (!granted) { alert('USB access denied.'); return; }
      await usbService.startMonitoring();
      setIsMonitoring(true);
      setConnectedTotems(usbService.getConnectedTotems());
    } catch { alert('Failed to start USB monitoring.'); }
  };

  const stopUSBMonitoring = () => { usbService.stopMonitoring(); setIsMonitoring(false); };

  const startDemoMode = () => {
    const demo = demoModeService.startDemoMode();
    setConnectedTotems(demo);
    setIsDemoMode(true);
    demoModeService.subscribe((updated) => {
      setConnectedTotems(p => p.map(c => updated.find(u => u.id === c.id) || c));
      setTotemPole(p => p.map(c => updated.find(u => u.id === c.id) || c));
    });
  };

  const stopDemoMode = () => {
    demoModeService.stopDemoMode();
    setConnectedTotems([]); setTotemPole([]); setIsDemoMode(false);
  };

  const addToPole = (t: TotemStatus) => {
    setTotemPole(p => [...p, { ...t, position: p.length }]);
    setConnectedTotems(p => p.filter(c => c.id !== t.id));
  };
  const removeFromPole = (id: string) => {
    const t = totemPole.find(x => x.id === id);
    if (!t) return;
    setTotemPole(p => p.filter(x => x.id !== id).map((x, i) => ({ ...x, position: i })));
    if (t.connected) setConnectedTotems(p => [...p, t]);
  };
  const moveUp = (id: string) => setTotemPole(p => {
    const i = p.findIndex(x => x.id === id); if (i <= 0) return p;
    const a = [...p]; [a[i], a[i-1]] = [a[i-1], a[i]]; return a.map((x,j) => ({...x,position:j}));
  });
  const moveDown = (id: string) => setTotemPole(p => {
    const i = p.findIndex(x => x.id === id); if (i < 0 || i >= p.length-1) return p;
    const a = [...p]; [a[i], a[i+1]] = [a[i+1], a[i]]; return a.map((x,j) => ({...x,position:j}));
  });

  const active = isMonitoring || isDemoMode;

  return (
    <div style={{ height: '100vh', background: tok.pageBg, display: 'flex', flexDirection: 'column', fontFamily: "'Nunito','Helvetica Neue',sans-serif", overflow: 'hidden', transition: 'background 0.3s' }}>

      {/* Top bar */}
      <div style={{
        background: tok.cardBg, backdropFilter: 'blur(12px)',
        borderBottom: `1.5px solid ${tok.border}`,
        padding: '12px 20px 12px 200px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', boxShadow: tok.shadow, flexShrink: 0,
        transition: 'background 0.3s, border-color 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: tok.orangeFaint, border: `1.5px solid ${tok.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚙️</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: tok.textPrimary }}>MakeyDooey IDE</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: 20,
            border: `1.5px solid ${active ? `${tok.green}55` : tok.borderSubtle}`,
            background: active ? tok.greenFaint : tok.orangeFaint,
            fontSize: 11, fontWeight: 700,
            color: active ? tok.greenText : tok.textMuted,
          }}>
            <span style={{ fontSize: 8, marginRight: 5 }}>●</span>
            {isDemoMode ? 'Demo Mode' : isMonitoring ? 'USB Active' : 'Not Connected'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isMonitoring && !isDemoMode ? (
            <>
              <Btn tok={tok} onClick={startUSBMonitoring} variant="outline">🔌 Connect USB</Btn>
              <Btn tok={tok} onClick={startDemoMode} variant="orange">🎬 Demo Mode</Btn>
            </>
          ) : isDemoMode ? (
            <Btn tok={tok} onClick={stopDemoMode} variant="ghost">Stop Demo</Btn>
          ) : (
            <Btn tok={tok} onClick={stopUSBMonitoring} variant="ghost">Disconnect</Btn>
          )}
          {!usbService.isSupported() && !isDemoMode && (
            <span style={{ padding: '5px 10px', background: tok.amberFaint, border: `1.5px solid ${tok.amber}55`, borderRadius: 8, fontSize: 11, color: tok.amberText, fontWeight: 700 }}>⚠️ Chrome/Edge required</span>
          )}
        </div>
      </div>

      {/* Three-column body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Detected totems */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: tok.panelBg, borderRight: `1.5px solid ${tok.border}`, overflow: 'hidden', transition: 'background 0.3s' }}>
          <PanelHeader tok={tok} title="Detected Totems" count={connectedTotems.length} />
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connectedTotems.length === 0
              ? <EmptyState tok={tok} icon="🔍" text={isDemoMode ? 'All totems added!' : isMonitoring ? 'No totems on USB' : 'Start Demo Mode or\nConnect USB to begin'} />
              : connectedTotems.map(t => <DetectedCard key={t.id} tok={tok} totem={t} onAdd={() => addToPole(t)} />)
            }
          </div>
        </div>

        {/* Totem pole */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <PanelHeader tok={tok} title="Totem Pole" count={totemPole.length} />
          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {totemPole.length === 0
              ? <EmptyState tok={tok} icon="🗿" text={'No totems yet\nAdd from the sidebar'} />
              : <>
                  {[...totemPole].reverse().map(t => {
                    const idx = totemPole.findIndex(x => x.id === t.id);
                    return (
                      <TotemBlock key={t.id} tok={tok} totem={t}
                        isSelected={selectedTotem === t.id}
                        onSelect={() => setSelectedTotem(t.id)}
                        onDoubleClick={() => onTotemDoubleClick(t)}
                        onRemove={() => removeFromPole(t.id)}
                        onMoveUp={idx < totemPole.length - 1 ? () => moveUp(t.id) : undefined}
                        onMoveDown={idx > 0 ? () => moveDown(t.id) : undefined}
                      />
                    );
                  })}
                  <div style={{ width: '100%', maxWidth: 380, height: 48, background: tok.orangeFaint, border: `2px dashed ${tok.border}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: tok.orangeText, letterSpacing: 2 }}>
                    BASE PLATFORM
                  </div>
                </>
            }
          </div>
        </div>

        {/* Details */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: tok.panelBg, borderLeft: `1.5px solid ${tok.border}`, overflow: 'hidden', transition: 'background 0.3s' }}>
          <PanelHeader tok={tok} title="Details" />
          <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
            {selectedTotem
              ? (() => { const t = totemPole.find(x => x.id === selectedTotem); return t ? <TotemDetails tok={tok} totem={t} onProgram={() => onTotemDoubleClick(t)} /> : null; })()
              : <EmptyState tok={tok} icon="📋" text="Select a totem to view details" />
            }
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PanelHeader({ tok, title, count }: { tok: Tokens; title: string; count?: number }) {
  return (
    <div style={{ padding: '14px 16px 12px', borderBottom: `1.5px solid ${tok.border}`, background: tok.panelHeaderBg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, transition: 'background 0.3s' }}>
      <span style={{ fontWeight: 800, fontSize: 13, color: tok.textPrimary }}>{title}</span>
      {count !== undefined && (
        <span style={{ background: tok.orangeFaint, border: `1.5px solid ${tok.border}`, borderRadius: 12, padding: '1px 9px', fontSize: 12, fontWeight: 700, color: tok.orangeText }}>{count}</span>
      )}
    </div>
  );
}

function EmptyState({ tok, icon, text }: { tok: Tokens; icon: string; text: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '30px 0' }}>
      <span style={{ fontSize: 36, opacity: 0.25 }}>{icon}</span>
      <span style={{ fontSize: 12, color: tok.textMuted, textAlign: 'center', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{text}</span>
    </div>
  );
}

function Btn({ tok, children, onClick, variant }: { tok: Tokens; children: React.ReactNode; onClick: () => void; variant: 'orange'|'outline'|'ghost' }) {
  const [h, setH] = useState(false);
  const vs: Record<string, React.CSSProperties> = {
    orange: { background: h ? tok.orangeHover : tok.orange, color: '#fff', border: 'none', boxShadow: h ? `0 4px 14px ${tok.orangeSubtle}` : `0 2px 8px ${tok.orangeSubtle}` },
    outline: { background: h ? tok.orangeFaint : tok.cardBg, color: tok.orangeText, border: `1.5px solid ${tok.border}` },
    ghost:  { background: h ? tok.purpleFaint : 'transparent', color: tok.purple, border: `1.5px solid ${h ? tok.purple+'55' : tok.borderSubtle}` },
  };
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, fontFamily: "'Nunito',sans-serif", fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s, box-shadow 0.15s', display: 'inline-flex', alignItems: 'center', gap: 5, ...vs[variant] }}>
      {children}
    </button>
  );
}

function DetectedCard({ tok, totem, onAdd }: { tok: Tokens; totem: TotemStatus; onAdd: () => void }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${h ? tok.borderStrong : tok.border}`, background: h ? tok.surfaceHover : tok.cardBg, transition: 'background 0.15s, border-color 0.15s', boxShadow: tok.shadow }}>
      <span style={{ fontSize: 28 }}>{getEmoji(totem.type)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: tok.textPrimary }}>{totem.name}</div>
        <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 1 }}>{totem.type}</div>
        <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: "'DM Mono',monospace", marginTop: 1 }}>S/N: {totem.serialNumber}</div>
      </div>
      <button onClick={onAdd} style={{ width: 30, height: 30, borderRadius: 8, background: tok.orange, color: '#fff', border: 'none', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, boxShadow: `0 2px 8px ${tok.orangeSubtle}`, transition: 'background 0.15s' }}>＋</button>
    </div>
  );
}

function TotemBlock({ tok, totem, isSelected, onSelect, onDoubleClick, onRemove, onMoveUp, onMoveDown }: {
  tok: Tokens; totem: TotemStatus; isSelected: boolean;
  onSelect: () => void; onDoubleClick: () => void; onRemove: () => void;
  onMoveUp?: () => void; onMoveDown?: () => void;
}) {
  return (
    <div onClick={onSelect} onDoubleClick={onDoubleClick}
      style={{ width: '100%', maxWidth: 380, background: tok.cardBg, borderRadius: 14, border: `1.5px solid ${isSelected ? tok.orange : tok.border}`, padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8, opacity: totem.connected ? 1 : 0.5, boxShadow: isSelected ? `0 0 0 3px ${tok.orangeSubtle}, ${tok.shadow}` : tok.shadow, transition: 'border-color 0.15s, box-shadow 0.15s, background 0.3s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 28 }}>{getEmoji(totem.type)}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: tok.textPrimary }}>{totem.name}</div>
          <div style={{ fontSize: 11, color: tok.textMuted }}>Pos {totem.position}</div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {[getPowerColor(totem.powerState), getProgrammingColor(totem.programmingState), getRuntimeColor(totem.runtimeState)].map((c, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, display: 'block', border: `1.5px solid ${tok.cardBg}` }} />
          ))}
        </div>
      </div>
      {isSelected && (
        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: `1px solid ${tok.border}` }}>
          {onMoveUp && <MiniBtn tok={tok} onClick={onMoveUp}>↑ Up</MiniBtn>}
          {onMoveDown && <MiniBtn tok={tok} onClick={onMoveDown}>↓ Down</MiniBtn>}
          <MiniBtn tok={tok} onClick={onRemove} danger>✕ Remove</MiniBtn>
        </div>
      )}
    </div>
  );
}

function MiniBtn({ tok, children, onClick, danger }: { tok: Tokens; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: '4px 10px', border: `1.5px solid ${danger ? tok.red+'44' : tok.border}`, borderRadius: 6, background: h ? (danger ? tok.redFaint : tok.orangeFaint) : 'transparent', color: danger ? tok.red : tok.orangeText, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'background 0.12s', fontFamily: "'Nunito',sans-serif" }}>
      {children}
    </button>
  );
}

function TotemDetails({ tok, totem, onProgram }: { tok: Tokens; totem: TotemStatus; onProgram: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[
        { title: 'Basic Info', rows: [['Type', totem.type], ['Serial #', totem.serialNumber], ['Position', `${totem.position}`], ['Bus Address', `0x${totem.busAddress.toString(16).toUpperCase()}`]] },
        { title: '⚡ Power', rows: [['State', totem.powerState, getPowerColor(totem.powerState)], ...(totem.voltage !== undefined ? [['Voltage', `${totem.voltage.toFixed(2)}V`]] : []), ...(totem.current !== undefined ? [['Current', `${totem.current.toFixed(1)}mA`]] : [])] },
        { title: '💾 Programming', rows: [['State', totem.programmingState, getProgrammingColor(totem.programmingState)], ...(totem.firmwareVersion ? [['Firmware', totem.firmwareVersion]] : [])] },
      ].map(({ title, rows }) => (
        <div key={title} style={{ background: tok.cardBg, border: `1.5px solid ${tok.border}`, borderRadius: 12, padding: '12px 14px', transition: 'background 0.3s' }}>
          <div style={{ fontWeight: 800, fontSize: 11, color: tok.orange, letterSpacing: '0.3px', marginBottom: 10, textTransform: 'uppercase' }}>{title}</div>
          {(rows as [string, string, string?][]).map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
              <span style={{ color: tok.textMuted }}>{label}</span>
              <span style={{ color: color || tok.textPrimary, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      ))}
      <button onClick={onProgram}
        style={{ width: '100%', padding: 12, background: tok.orange, border: 'none', borderRadius: 10, color: '#fff', fontFamily: "'Nunito',sans-serif", fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: `0 3px 12px ${tok.orangeSubtle}`, transition: 'background 0.15s' }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = tok.orangeHover}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = tok.orange}>
        💾 Program This Totem
      </button>
    </div>
  );
}

function getEmoji(type: string) {
  return ({ 'mcu-controller':'🖥️','sensor-temp':'🌡️','sensor-voltage':'⚡','actuator-pwm':'📡','actuator-relay':'🔌','comm-uart':'📤','comm-i2c':'🔗','power-mppt':'🔋','unknown':'❓' } as Record<string,string>)[type] || '📦';
}
function getPowerColor(s: PowerState) {
  return s==='powered'?'#22c55e':s==='low-voltage'?'#f59e0b':s==='overvoltage'?'#ef4444':'#6b7280';
}
function getProgrammingColor(s: string) {
  return s==='programmed'?'#22c55e':s==='programming'?'#3b82f6':s==='failed'?'#ef4444':'#6b7280';
}
function getRuntimeColor(s: string) {
  return s==='running'?'#22c55e':s==='paused'?'#f59e0b':s==='fault'?'#ef4444':s==='idle'?'#3b82f6':'#6b7280';
}

export default TotemPoleVisualizer;