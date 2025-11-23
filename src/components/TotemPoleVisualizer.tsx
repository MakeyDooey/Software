// src/components/TotemPoleVisualizer.tsx

import React, { useState, useEffect } from 'react';
import type { TotemStatus, PowerState } from '../types/totem';
import usbService from '../services/usbService';
import demoModeService from '../services/platform/demoModeService';

interface TotemPoleVisualizerProps {
  onTotemDoubleClick: (totem: TotemStatus) => void;
}

export const TotemPoleVisualizer: React.FC<TotemPoleVisualizerProps> = ({ onTotemDoubleClick }) => {
  const [connectedTotems, setConnectedTotems] = useState<TotemStatus[]>([]);
  const [totemPole, setTotemPole] = useState<TotemStatus[]>([]);
  const [selectedTotem, setSelectedTotem] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    // Subscribe to USB connection events
    const unsubscribe = usbService.subscribe((event) => {
      if (event.action === 'connected') {
        setConnectedTotems(prev => [...prev, event.totem]);
        addLog('info', `Totem connected: ${event.totem.name}`, 'usb');
      } else {
        setConnectedTotems(prev => prev.filter(t => t.id !== event.totem.id));
        setTotemPole(prev => prev.map(t => 
          t.id === event.totem.id ? { ...t, connected: false } : t
        ));
        addLog('warning', `Totem disconnected: ${event.totem.name}`, 'usb');
      }
    });

    return () => unsubscribe();
  }, []);

  const addLog = (level: string, message: string, source: string) => {
    console.log(`[${level.toUpperCase()}] ${source}: ${message}`);
  };

  const startUSBMonitoring = async () => {
    try {
      const granted = await usbService.requestPermission();
      if (!granted) {
        alert('USB access denied. Please grant permission to detect totems.');
        return;
      }

      await usbService.startMonitoring();
      setIsMonitoring(true);
      
      const connected = usbService.getConnectedTotems();
      setConnectedTotems(connected);
      
      addLog('info', 'USB monitoring started', 'system');
    } catch (error) {
      console.error('Failed to start USB monitoring:', error);
      alert('Failed to start USB monitoring. Check console for details.');
    }
  };

  const stopUSBMonitoring = () => {
    usbService.stopMonitoring();
    setIsMonitoring(false);
    addLog('info', 'USB monitoring stopped', 'system');
  };

  const startDemoMode = () => {
    const demoTotems = demoModeService.startDemoMode();
    setConnectedTotems(demoTotems);
    setIsDemoMode(true);
    addLog('info', `Demo mode started with ${demoTotems.length} mock totems`, 'demo');

    // Subscribe to demo updates
    demoModeService.subscribe((updatedTotems) => {
      setConnectedTotems(prevConnected => {
        // Only update totems that are still in connected list
        return prevConnected.map(ct => {
          const updated = updatedTotems.find(ut => ut.id === ct.id);
          return updated || ct;
        });
      });
      
      setTotemPole(prev => prev.map(poleTotem => {
        const updated = updatedTotems.find(t => t.id === poleTotem.id);
        return updated ? updated : poleTotem;
      }));
    });
  };

  const stopDemoMode = () => {
    demoModeService.stopDemoMode();
    setConnectedTotems([]);
    setTotemPole([]);
    setIsDemoMode(false);
    addLog('info', 'Demo mode stopped', 'demo');
  };

  const addTotemToPole = (totem: TotemStatus) => {
    const newPosition = totemPole.length;
    const totemWithPosition = { ...totem, position: newPosition };
    
    setTotemPole(prev => [...prev, totemWithPosition]);
    setConnectedTotems(prev => prev.filter(t => t.id !== totem.id));
    
    addLog('info', `Added ${totem.name} to totem pole at position ${newPosition}`, 'visualizer');
  };

  const removeTotemFromPole = (totemId: string) => {
    const totem = totemPole.find(t => t.id === totemId);
    if (!totem) return;

    setTotemPole(prev => prev.filter(t => t.id !== totemId).map((t, i) => ({ ...t, position: i })));
    
    if (totem.connected) {
      setConnectedTotems(prev => [...prev, totem]);
    }
    
    addLog('info', `Removed ${totem.name} from totem pole`, 'visualizer');
  };

  const moveTotemUp = (totemId: string) => {
    setTotemPole(prev => {
      const index = prev.findIndex(t => t.id === totemId);
      if (index <= 0) return prev;

      const newPole = [...prev];
      [newPole[index], newPole[index - 1]] = [newPole[index - 1], newPole[index]];
      
      return newPole.map((t, i) => ({ ...t, position: i }));
    });
  };

  const moveTotemDown = (totemId: string) => {
    setTotemPole(prev => {
      const index = prev.findIndex(t => t.id === totemId);
      if (index < 0 || index >= prev.length - 1) return prev;

      const newPole = [...prev];
      [newPole[index], newPole[index + 1]] = [newPole[index + 1], newPole[index]];
      
      return newPole.map((t, i) => ({ ...t, position: i }));
    });
  };

  return (
    <div style={styles.container}>
      {/* Connection Panel */}
      <div style={styles.connectionPanel}>
        <h3 style={styles.panelTitle}>Connection</h3>
        
        {!isMonitoring && !isDemoMode ? (
          <>
            <button style={styles.btnPrimary} onClick={startUSBMonitoring}>
              🔌 Connect USB Hardware
            </button>
            <button style={styles.btnDemo} onClick={startDemoMode}>
              🎬 Start Demo Mode
            </button>
          </>
        ) : isDemoMode ? (
          <button style={styles.btnSecondary} onClick={stopDemoMode}>
            🎬 Stop Demo Mode
          </button>
        ) : (
          <button style={styles.btnSecondary} onClick={stopUSBMonitoring}>
            🔌 Disconnect
          </button>
        )}

        <div style={styles.statusIndicator}>
          <span style={{
            ...styles.statusDot,
            backgroundColor: (isMonitoring || isDemoMode) ? '#4CAF50' : '#888'
          }} />
          <span style={styles.statusText}>
            {isDemoMode ? '🎬 Demo Mode Active' : isMonitoring ? 'USB Monitoring' : 'Not Connected'}
          </span>
        </div>

        {!usbService.isSupported() && !isDemoMode && (
          <div style={styles.warningBox}>
            ⚠️ Web Serial API not supported. Use Demo Mode or switch to Chrome/Edge.
          </div>
        )}
      </div>

      <div style={styles.mainArea}>
        {/* Detected Totems Sidebar */}
        <div style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>
            Detected Totems ({connectedTotems.length})
          </h3>
          
          {connectedTotems.length === 0 ? (
            <div style={styles.emptyMessage}>
              {isDemoMode ? 
                'All totems added to pole!' :
                isMonitoring ? 
                'No totems detected on USB bus.' :
                'Click "Connect USB" or "Demo Mode" to start.'
              }
            </div>
          ) : (
            <div style={styles.totemList}>
              {connectedTotems.map(totem => (
                <ConnectedTotemCard
                  key={totem.id}
                  totem={totem}
                  onAddToPole={() => addTotemToPole(totem)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Totem Pole Visualizer */}
        <div style={styles.visualizerArea}>
          <h3 style={styles.visualizerTitle}>
            Totem Pole Configuration ({totemPole.length} totems)
          </h3>
          
          {totemPole.length === 0 ? (
            <div style={styles.emptyPole}>
              <div style={styles.emptyPoleIcon}>🗿</div>
              <div style={styles.emptyPoleText}>
                No totems in the pole yet
              </div>
              <div style={styles.emptyPoleSubtext}>
                {isDemoMode || isMonitoring ? 
                  'Add totems from the detected list →' :
                  'Start Demo Mode to see mock totems'}
              </div>
            </div>
          ) : (
            <div style={styles.totemPoleStack}>
              {[...totemPole].reverse().map((totem, visualIndex) => {
                const actualIndex = totemPole.length - 1 - visualIndex;
                return (
                  <TotemIcon
                    key={totem.id}
                    totem={totem}
                    isSelected={selectedTotem === totem.id}
                    onSelect={() => setSelectedTotem(totem.id)}
                    onDoubleClick={() => onTotemDoubleClick(totem)}
                    onRemove={() => removeTotemFromPole(totem.id)}
                    onMoveUp={actualIndex < totemPole.length - 1 ? () => moveTotemUp(totem.id) : undefined}
                    onMoveDown={actualIndex > 0 ? () => moveTotemDown(totem.id) : undefined}
                  />
                );
              })}
              
              <div style={styles.poleBase}>
                <div style={styles.baseLabel}>BASE PLATFORM</div>
              </div>
            </div>
          )}
        </div>

        {/* Totem Details Panel */}
        <div style={styles.detailsPanel}>
          <h3 style={styles.detailsTitle}>Totem Details</h3>
          
          {selectedTotem ? (
            (() => {
              const totem = totemPole.find(t => t.id === selectedTotem);
              return totem ? <TotemDetailsView totem={totem} onDoubleClick={onTotemDoubleClick} /> : (
                <div style={styles.emptyMessage}>Totem not found</div>
              );
            })()
          ) : (
            <div style={styles.emptyMessage}>
              Select a totem to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Connected Totem Card Component
const ConnectedTotemCard: React.FC<{
  totem: TotemStatus;
  onAddToPole: () => void;
}> = ({ totem, onAddToPole }) => {
  return (
    <div style={styles.totemCard}>
      <div style={styles.totemCardIcon}>
        {getTotemEmoji(totem.type)}
      </div>
      <div style={styles.totemCardInfo}>
        <div style={styles.totemCardName}>{totem.name}</div>
        <div style={styles.totemCardType}>{totem.type}</div>
        <div style={styles.totemCardSerial}>S/N: {totem.serialNumber}</div>
      </div>
      <button style={styles.addButton} onClick={onAddToPole} title="Add to totem pole">
        ➕
      </button>
    </div>
  );
};

// Totem Icon in Pole
const TotemIcon: React.FC<{
  totem: TotemStatus;
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClick: () => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}> = ({ totem, isSelected, onSelect, onDoubleClick, onRemove, onMoveUp, onMoveDown }) => {
  return (
    <div
      style={{
        ...styles.totemIcon,
        ...(isSelected ? styles.totemIconSelected : {}),
        ...(totem.connected ? {} : styles.totemIconDisconnected)
      }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      <div style={styles.totemVisual}>
        <div style={styles.totemEmoji}>{getTotemEmoji(totem.type)}</div>
        <div style={styles.totemName}>{totem.name}</div>
      </div>

      {/* Status Indicators */}
      <div style={styles.statusBar}>
        <StatusIndicator
          icon="⚡"
          label="Power"
          status={totem.powerState}
          color={getPowerColor(totem.powerState)}
          tooltip={`Power: ${totem.powerState}${totem.voltage ? ` (${totem.voltage.toFixed(2)}V)` : ''}`}
        />
        <StatusIndicator
          icon="💾"
          label="Program"
          status={totem.programmingState}
          color={getProgrammingColor(totem.programmingState)}
          tooltip={`Programming: ${totem.programmingState}`}
        />
        <StatusIndicator
          icon="▶️"
          label="Runtime"
          status={totem.runtimeState}
          color={getRuntimeColor(totem.runtimeState)}
          tooltip={`Runtime: ${totem.runtimeState}`}
        />
        {totem.softwareFault !== 'none' && (
          <StatusIndicator
            icon="⚠️"
            label="SW Fault"
            status={totem.softwareFault}
            color="#FF9800"
            tooltip={`Software Fault: ${totem.softwareFault}`}
          />
        )}
        {totem.hardwareFault !== 'none' && (
          <StatusIndicator
            icon="🔧"
            label="HW Fault"
            status={totem.hardwareFault}
            color="#F44336"
            tooltip={`Hardware Fault: ${totem.hardwareFault}`}
          />
        )}
      </div>

      <div style={styles.positionBadge}>
        Pos {totem.position}
      </div>

      {isSelected && (
        <div style={styles.totemActions}>
          {onMoveUp && (
            <button style={styles.actionBtn} onClick={(e) => { e.stopPropagation(); onMoveUp(); }} title="Move up">
              ⬆️
            </button>
          )}
          {onMoveDown && (
            <button style={styles.actionBtn} onClick={(e) => { e.stopPropagation(); onMoveDown(); }} title="Move down">
              ⬇️
            </button>
          )}
          <button style={styles.actionBtnRemove} onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove from pole">
            ❌
          </button>
        </div>
      )}
    </div>
  );
};

// Status Indicator Component
const StatusIndicator: React.FC<{
  icon: string;
  label: string;
  status: string;
  color: string;
  tooltip: string;
}> = ({ icon, label, status, color, tooltip }) => {
  return (
    <div style={styles.indicator} title={tooltip}>
      <span style={{ fontSize: '16px' }}>{icon}</span>
      <div style={{ ...styles.indicatorDot, backgroundColor: color }} />
    </div>
  );
};

// Totem Details View
const TotemDetailsView: React.FC<{ totem: TotemStatus; onDoubleClick: (totem: TotemStatus) => void }> = ({ totem, onDoubleClick }) => {
  return (
    <div style={styles.detailsContent}>
      <div style={styles.detailSection}>
        <h4 style={styles.detailSectionTitle}>Basic Info</h4>
        <DetailRow label="Type" value={totem.type} />
        <DetailRow label="Serial #" value={totem.serialNumber} />
        <DetailRow label="Position" value={`${totem.position}`} />
        <DetailRow label="Bus Address" value={`0x${totem.busAddress.toString(16).toUpperCase()}`} />
      </div>

      <div style={styles.detailSection}>
        <h4 style={styles.detailSectionTitle}>⚡ Power Status</h4>
        <DetailRow label="State" value={totem.powerState} color={getPowerColor(totem.powerState)} />
        {totem.voltage !== undefined && (
          <DetailRow label="Voltage" value={`${totem.voltage.toFixed(2)}V`} />
        )}
        {totem.current !== undefined && (
          <DetailRow label="Current" value={`${totem.current.toFixed(1)}mA`} />
        )}
      </div>

      <div style={styles.detailSection}>
        <h4 style={styles.detailSectionTitle}>💾 Programming</h4>
        <DetailRow label="State" value={totem.programmingState} color={getProgrammingColor(totem.programmingState)} />
        {totem.firmwareVersion && (
          <DetailRow label="Firmware" value={totem.firmwareVersion} />
        )}
        {totem.lastProgrammed && (
          <DetailRow label="Last Programmed" value={totem.lastProgrammed.toLocaleString()} />
        )}
      </div>

      <div style={styles.detailSection}>
        <h4 style={styles.detailSectionTitle}>▶️ Runtime</h4>
        <DetailRow label="State" value={totem.runtimeState} color={getRuntimeColor(totem.runtimeState)} />
        {totem.uptime !== undefined && (
          <DetailRow label="Uptime" value={`${Math.floor(totem.uptime / 60)}m ${totem.uptime % 60}s`} />
        )}
      </div>

      {(totem.softwareFault !== 'none' || totem.hardwareFault !== 'none') && (
        <div style={styles.detailSection}>
          <h4 style={styles.detailSectionTitle}>⚠️ Faults</h4>
          {totem.softwareFault !== 'none' && (
            <DetailRow label="Software" value={totem.softwareFault} color="#FF9800" />
          )}
          {totem.hardwareFault !== 'none' && (
            <DetailRow label="Hardware" value={totem.hardwareFault} color="#F44336" />
          )}
          {totem.faultDetails && (
            <DetailRow label="Details" value={totem.faultDetails} />
          )}
        </div>
      )}

      <button style={styles.programButton} onClick={() => onDoubleClick(totem)}>
        💾 Program This Totem
      </button>
    </div>
  );
};

// Detail Row Component
const DetailRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => {
  return (
    <div style={styles.detailRow}>
      <span style={styles.detailLabel}>{label}:</span>
      <span style={{ ...styles.detailValue, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
};

// Helper functions
function getTotemEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    'mcu-controller': '🖥️',
    'sensor-temp': '🌡️',
    'sensor-voltage': '⚡',
    'actuator-pwm': '📡',
    'actuator-relay': '🔌',
    'comm-uart': '📤',
    'comm-i2c': '🔗',
    'power-mppt': '🔋',
    'unknown': '❓'
  };
  return emojiMap[type] || '📦';
}

function getPowerColor(state: PowerState): string {
  switch (state) {
    case 'powered': return '#4CAF50';
    case 'unpowered': return '#888';
    case 'low-voltage': return '#FF9800';
    case 'overvoltage': return '#F44336';
    default: return '#888';
  }
}

function getProgrammingColor(state: string): string {
  switch (state) {
    case 'programmed': return '#4CAF50';
    case 'programming': return '#2196F3';
    case 'not-programmed': return '#888';
    case 'failed': return '#F44336';
    default: return '#888';
  }
}

function getRuntimeColor(state: string): string {
  switch (state) {
    case 'running': return '#4CAF50';
    case 'paused': return '#FF9800';
    case 'stopped': return '#888';
    case 'fault': return '#F44336';
    case 'idle': return '#2196F3';
    default: return '#888';
  }
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e1e',
    color: '#fff',
  },
  connectionPanel: {
    padding: '20px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
  },
  panelTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: 0,
  },
  btnPrimary: {
    backgroundColor: '#007acc',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  btnDemo: {
    backgroundColor: '#FF9800',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  statusText: {
    fontSize: '14px',
    color: '#ccc',
  },
  warningBox: {
    backgroundColor: '#332200',
    color: '#ffaa00',
    padding: '10px 15px',
    borderRadius: '6px',
    fontSize: '13px',
    border: '1px solid #664400',
  },
  mainArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: '280px',
    backgroundColor: '#252526',
    borderRight: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    padding: '20px',
    margin: 0,
    borderBottom: '1px solid #333',
  },
  emptyMessage: {
    padding: '20px',
    color: '#888',
    fontSize: '14px',
    textAlign: 'center',
  },
  totemList: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px',
  },
  totemCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px',
    backgroundColor: '#2d2d2d',
    borderRadius: '8px',
    marginBottom: '8px',
    border: '1px solid #444',
  },
  totemCardIcon: {
    fontSize: '32px',
  },
  totemCardInfo: {
    flex: 1,
  },
  totemCardName: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '2px',
  },
  totemCardType: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '2px',
  },
  totemCardSerial: {
    fontSize: '11px',
    color: '#666',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    fontSize: '18px',
    cursor: 'pointer',
  },
  visualizerArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  visualizerTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    padding: '20px',
    margin: 0,
    borderBottom: '1px solid #333',
  },
  emptyPole: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '15px',
  },
  emptyPoleIcon: {
    fontSize: '64px',
    opacity: 0.3,
  },
  emptyPoleText: {
    fontSize: '18px',
    color: '#888',
  },
  emptyPoleSubtext: {
    fontSize: '14px',
    color: '#666',
  },
  totemPoleStack: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    alignItems: 'center',
  },
  totemIcon: {
    width: '320px',
    backgroundColor: '#2d2d2d',
    border: '2px solid #444',
    borderRadius: '12px',
    padding: '15px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative',
  },
  totemIconSelected: {
    border: '2px solid #007acc',
    boxShadow: '0 0 15px rgba(0, 122, 204, 0.5)',
  },
  totemIconDisconnected: {
    opacity: 0.5,
    border: '2px dashed #666',
  },
  totemVisual: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    marginBottom: '10px',
  },
  totemEmoji: {
    fontSize: '36px',
  },
  totemName: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  statusBar: {
    display: 'flex',
    gap: '12px',
    marginTop: '10px',
  },
  indicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  indicatorDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  positionBadge: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: '#007acc',
    color: 'white',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  totemActions: {
    position: 'absolute',
    bottom: '10px',
    right: '10px',
    display: 'flex',
    gap: '6px',
  },
  actionBtn: {
    backgroundColor: '#007acc',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  actionBtnRemove: {
    backgroundColor: '#F44336',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  poleBase: {
    width: '360px',
    height: '60px',
    backgroundColor: '#444',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '10px',
    border: '2px solid #666',
  },
  baseLabel: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#ccc',
  },
  detailsPanel: {
    width: '320px',
    backgroundColor: '#252526',
    borderLeft: '1px solid #333',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  detailsTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    padding: '20px',
    margin: 0,
    borderBottom: '1px solid #333',
  },
  detailsContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
  },
  detailSection: {
    marginBottom: '20px',
  },
  detailSectionTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '10px',
    color: '#007acc',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '8px',
    fontSize: '13px',
  },
  detailLabel: {
    color: '#888',
  },
  detailValue: {
    color: '#fff',
    fontWeight: '500',
  },
  programButton: {
    width: '100%',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '20px',
  },
};

export default TotemPoleVisualizer;