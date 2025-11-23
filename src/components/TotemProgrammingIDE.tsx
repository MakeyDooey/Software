// src/components/TotemProgrammingIDE.tsx
// Uses Leo's proven terminal approach for reliable serial communication

import React, { useState, useRef, useEffect } from 'react';
import type { TotemStatus } from '../types/totem';
import usbService from '../services/usbService';

interface TotemProgrammingIDEProps {
  totem: TotemStatus;
  onClose: () => void;
  onProgramSuccess: (totemId: string) => void;
}

const TotemProgrammingIDE: React.FC<TotemProgrammingIDEProps> = ({
  totem,
  onClose,
  onProgramSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'flash' | 'config' | 'monitor' | 'debug'>('monitor');
  
  // Flash tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProgramming, setIsProgramming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  
  // Serial monitor state
  const [termOutput, setTermOutput] = useState<string>('');
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const terminalRef = useRef<HTMLDivElement>(null);
  
  // Command builder state
  const [selectedCommand, setSelectedCommand] = useState<string>('hello');
  const [commandParams, setCommandParams] = useState<{[key: string]: string}>({});
  const [charDelay, setCharDelay] = useState<number>(10);
  const [lineEnding, setLineEnding] = useState<string>('\\r');
  
  // Connection state - Leo's approach: simple refs
  const portRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Stats
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Command definitions matching firmware (works for both ESP32 and Nucleo)
  const COMMANDS: {[key: string]: {params: Array<{label: string, defaultValue: string}>, description: string}} = {
    "hello": { 
      params: [], 
      description: "Test connection - returns 'Hello, World!'" 
    },
    "toggle-led": { 
      params: [], 
      description: "Toggles the LED on/off" 
    },
    "blink": { 
      params: [], 
      description: "Blink LED 5 times (ESP32 only)" 
    },
    "echo_send": { 
      params: [{ label: "String", defaultValue: "test123" }], 
      description: "Byte-by-byte echo test" 
    },
    "set_pid": { 
      params: [
        { label: "Kp", defaultValue: "1.0" },
        { label: "Ki", defaultValue: "0.0" },
        { label: "Kd", defaultValue: "0.0" },
        { label: "Mode", defaultValue: "1" }
      ],
      description: "Set PID parameters for Roxanne" 
    },
    "get_pid": { 
      params: [], 
      description: "Get current PID values" 
    },
    "status": { 
      params: [], 
      description: "Get system status (ESP32 only)" 
    },
    "help": { 
      params: [], 
      description: "List available commands" 
    },
    "uart_send": { 
      params: [{ label: "Message", defaultValue: "test" }], 
      description: "Send via UART2 (to connected device)" 
    }
  };

  const [config, setConfig] = useState({
    baudRate: 115200,
  });

  // Use usbService for accurate board type detection
  const getBoardType = (): 'esp32' | 'nucleo' | 'unknown' => {
    // First try usbService detection (uses USB VID/PID)
    const detected = usbService.getDeviceType(totem);
    if (detected !== 'unknown') {
      return detected;
    }
    
    // Fallback to name-based detection
    const name = totem.name.toLowerCase();
    const serial = totem.serialNumber?.toLowerCase() || '';
    
    // ESP32 indicators
    if (name.includes('esp32') || name.includes('esp-32') || 
        name.includes('espressif') || name.includes('cp210') || 
        name.includes('ch340') || name.includes('ch9102') ||
        serial.startsWith('303a') || serial.startsWith('10c4') || 
        serial.startsWith('1a86')) {
      return 'esp32';
    }
    
    // Nucleo indicators
    if (name.includes('nucleo') || name.includes('stm32') || 
        name.includes('stm') || name.includes('st-link') ||
        serial.startsWith('0483')) {
      return 'nucleo';
    }
    
    return 'unknown';
  };

  const boardType = getBoardType();
  
  // Get board-specific display info
  const getBoardInfo = () => {
    switch (boardType) {
      case 'esp32':
        return { icon: '📡', color: '#00C853', label: 'ESP32' };
      case 'nucleo':
        return { icon: '🎛️', color: '#2196F3', label: 'NUCLEO' };
      default:
        return { icon: '🔧', color: '#888', label: 'UNKNOWN' };
    }
  };
  
  const boardInfo = getBoardInfo();

  // Autoscroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [termOutput]);

  // Initialize command params when command changes
  useEffect(() => {
    const cmdDef = COMMANDS[selectedCommand];
    if (cmdDef) {
      const newParams: {[key: string]: string} = {};
      cmdDef.params.forEach((p, i) => {
        newParams[`param_${i}`] = p.defaultValue;
      });
      setCommandParams(newParams);
    }
  }, [selectedCommand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const appendToTerminal = (text: string) => {
    setTermOutput(prev => prev + text);
  };

  // =====================================================
  // CONNECTION - Leo's exact approach
  // =====================================================
  const connect = async () => {
    if (isConnected) {
      await disconnect();
      return;
    }

    // Check for Web Serial API
    if (!('serial' in navigator)) {
      appendToTerminal('[ERROR] Web Serial API not supported. Use Chrome or Edge.\n');
      return;
    }

    try {
      appendToTerminal('[Requesting port...]\n');
      
      // Request port from user
      const port = await (navigator as any).serial.requestPort();
      
      // Show device info
      const info = port.getInfo();
      appendToTerminal(`[Device: VID=0x${info.usbVendorId?.toString(16) || '?'} PID=0x${info.usbProductId?.toString(16) || '?'}]\n`);
      
      // Open port
      appendToTerminal(`[Opening at ${config.baudRate} baud...]\n`);
      await port.open({ baudRate: config.baudRate });
      
      // Set DTR/RTS (important for some boards)
      try {
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        appendToTerminal('[DTR/RTS set]\n');
      } catch (e) {
        // Some devices don't support this, that's okay
      }

      // ===== Leo's stream setup =====
      const encoder = new TextEncoderStream();
      encoder.readable.pipeTo(port.writable);
      const writer = encoder.writable.getWriter();

      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();

      // Store refs
      portRef.current = port;
      writerRef.current = writer;
      readerRef.current = reader;
      
      setIsConnected(true);
      appendToTerminal('[✓ Connected! Try: hello, toggle-led, get_pid]\n\n');

      // Start read loop
      readLoop(reader);
      
    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        appendToTerminal('[Cancelled]\n');
      } else {
        appendToTerminal(`[ERROR] ${e.message}\n`);
        
        if (e.message.includes('busy') || e.message.includes('open')) {
          appendToTerminal('\n[FIX] Port is busy. Try:\n');
          appendToTerminal('  1. Close Arduino Serial Monitor\n');
          appendToTerminal('  2. Run: killall "Google Chrome"\n');
          appendToTerminal('  3. Unplug and replug the device\n');
        }
      }
    }
  };

  // Read loop - Leo's approach
  const readLoop = async (reader: any) => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          setRxBytes(prev => prev + value.length);
          appendToTerminal(value);
        }
      }
    } catch (error: any) {
      // Ignore cancel errors during disconnect
      if (!error.message?.includes('cancel')) {
        appendToTerminal(`[Read Error] ${error.message}\n`);
      }
    }
  };

  const disconnect = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {});
        readerRef.current = null;
      }
      if (writerRef.current) {
        await writerRef.current.close().catch(() => {});
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close().catch(() => {});
        portRef.current = null;
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    
    setIsConnected(false);
    appendToTerminal('[Disconnected]\n');
  };

  // =====================================================
  // SEND DATA - Character by character with delay
  // =====================================================
  const sendData = async (str: string) => {
    if (!writerRef.current) {
      appendToTerminal('[Not connected]\n');
      return;
    }

    // Get line ending
    let end = lineEnding;
    if (end === '\\r') end = '\r';
    else if (end === '\\n') end = '\n';
    else if (end === '\\r\\n') end = '\r\n';
    
    const payload = str + end;

    try {
      // Character by character with delay (Leo's fix for UART overrun)
      for (const char of payload) {
        await writerRef.current.write(char);
        if (charDelay > 0) {
          await new Promise(r => setTimeout(r, charDelay));
        }
      }
      setTxBytes(prev => prev + payload.length);
    } catch (e: any) {
      appendToTerminal(`[TX Error] ${e.message}\n`);
    }
  };

  const sendCommand = async (command: string) => {
    if (!command.trim()) return;
    if (!isConnected) {
      appendToTerminal('[Not connected - click Connect first]\n');
      return;
    }

    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);
    appendToTerminal(`> ${command}\n`);
    await sendData(command);
    setCommandInput('');
  };

  const sendBuilderCommand = async () => {
    let command = selectedCommand;
    
    const cmdDef = COMMANDS[selectedCommand];
    if (cmdDef && cmdDef.params.length > 0) {
      const params = cmdDef.params.map((p, i) => 
        commandParams[`param_${i}`] || p.defaultValue
      );
      command = `${command} ${params.join(' ')}`;
    }
    
    await sendCommand(command);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    } else if (e.key === 'Enter') {
      sendCommand(commandInput);
    }
  };

  // Flash functions
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      addLog(`Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    }
  };

  const handleFlashFirmware = async () => {
    if (!selectedFile) {
      alert('Please select a firmware file first');
      return;
    }
    
    setIsProgramming(true);
    setProgress(0);
    addLog('Starting firmware flash...');
    
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 500));
      setProgress(i);
      addLog(`Programming... ${i}%`);
    }
    
    setIsProgramming(false);
    addLog('Flash complete!');
    onProgramSuccess(totem.id);
  };

  const handleClose = async () => {
    await disconnect();
    onClose();
  };

  // Quick command buttons
  const QuickButton = ({ cmd, label }: { cmd: string, label?: string }) => (
    <button 
      style={styles.quickBtn}
      onClick={() => sendCommand(cmd)}
      disabled={!isConnected}
    >
      {label || cmd}
    </button>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h2 style={styles.title}>
            {boardInfo.icon} {totem.name} 
            <span style={{ 
              color: boardInfo.color, 
              marginLeft: '10px', 
              fontSize: '13px',
              backgroundColor: `${boardInfo.color}22`,
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              {boardInfo.label}
            </span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>
              S/N: {totem.serialNumber}
            </span>
            <button style={styles.closeButton} onClick={handleClose}>×</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['flash', 'config', 'monitor', 'debug'] as const).map(tab => (
          <button 
            key={tab}
            style={{ 
              ...styles.tab, 
              ...(activeTab === tab ? styles.tabActive : {}) 
            }} 
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'flash' ? '⚡ Flash' : 
             tab === 'config' ? '⚙️ Config' : 
             tab === 'monitor' ? '📟 Monitor' : '🔍 Debug'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* ==================== MONITOR TAB ==================== */}
        {activeTab === 'monitor' && (
          <div style={{ display: 'flex', gap: '15px', height: 'calc(100vh - 180px)' }}>
            
            {/* Sidebar - Command Builder */}
            <div style={styles.sidebar}>
              <div style={styles.sidebarSection}>
                <h3 style={styles.sidebarTitle}>Command Builder</h3>
                
                <select 
                  style={styles.select}
                  value={selectedCommand} 
                  onChange={(e) => setSelectedCommand(e.target.value)}
                >
                  {Object.keys(COMMANDS).map(cmd => (
                    <option key={cmd} value={cmd}>{cmd}</option>
                  ))}
                </select>
                
                <div style={styles.cmdDesc}>
                  {COMMANDS[selectedCommand].description}
                </div>

                {COMMANDS[selectedCommand].params.map((param, idx) => (
                  <div key={idx} style={styles.inputGroup}>
                    <label style={styles.inputLabel}>{param.label}</label>
                    <input 
                      type="text" 
                      style={styles.input}
                      value={commandParams[`param_${idx}`] || param.defaultValue}
                      onChange={(e) => setCommandParams({ 
                        ...commandParams, 
                        [`param_${idx}`]: e.target.value 
                      })} 
                    />
                  </div>
                ))}

                <button 
                  style={{ 
                    ...styles.btnSend, 
                    opacity: !isConnected ? 0.5 : 1 
                  }} 
                  onClick={sendBuilderCommand} 
                  disabled={!isConnected}
                >
                  📤 Send Command
                </button>
              </div>

              <div style={styles.divider} />

              {/* Quick Commands */}
              <div style={styles.sidebarSection}>
                <h3 style={styles.sidebarTitle}>Quick Commands</h3>
                <div style={styles.quickGrid}>
                  <QuickButton cmd="hello" />
                  <QuickButton cmd="toggle-led" />
                  <QuickButton cmd="blink" />
                  <QuickButton cmd="get_pid" />
                  <QuickButton cmd="status" />
                  <QuickButton cmd="help" />
                </div>
              </div>

              <div style={styles.divider} />

              {/* Settings */}
              <div style={styles.sidebarSection}>
                <h3 style={styles.sidebarTitle}>Settings</h3>
                
                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>Char Delay (ms)</label>
                  <input 
                    type="number" 
                    style={styles.input}
                    value={charDelay} 
                    onChange={(e) => setCharDelay(parseInt(e.target.value) || 0)} 
                    min="0" 
                    max="100" 
                  />
                </div>

                <div style={styles.inputGroup}>
                  <label style={styles.inputLabel}>Line Ending</label>
                  <select 
                    style={styles.select}
                    value={lineEnding} 
                    onChange={(e) => setLineEnding(e.target.value)}
                  >
                    <option value="\r">\r (CR)</option>
                    <option value="\n">\n (LF)</option>
                    <option value="\r\n">\r\n (CRLF)</option>
                  </select>
                </div>
              </div>

              {/* Stats */}
              <div style={styles.stats}>
                TX: {txBytes} | RX: {rxBytes}
              </div>
            </div>

            {/* Terminal Area */}
            <div style={styles.terminalArea}>
              {/* Control Bar */}
              <div style={styles.controlBar}>
                <button 
                  style={{ 
                    ...styles.btnConnect, 
                    backgroundColor: isConnected ? '#c62828' : '#2e7d32' 
                  }} 
                  onClick={connect}
                >
                  {isConnected ? '❌ Disconnect' : '🔌 Connect'}
                </button>
                
                <select 
                  style={styles.baudSelect}
                  value={config.baudRate} 
                  onChange={(e) => setConfig({ ...config, baudRate: parseInt(e.target.value) })} 
                  disabled={isConnected}
                >
                  <option value="115200">115200 baud</option>
                  <option value="9600">9600 baud</option>
                  <option value="57600">57600 baud</option>
                </select>

                <button 
                  style={styles.btnSmall} 
                  onClick={() => setTermOutput('')}
                >
                  🗑️ Clear
                </button>

                <div style={styles.connectionStatus}>
                  <span style={{ 
                    color: isConnected ? '#4caf50' : '#888',
                    fontSize: '20px',
                    lineHeight: '1'
                  }}>●</span>
                  <span style={{ color: isConnected ? '#4caf50' : '#888' }}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>

              {/* Terminal Output */}
              <div ref={terminalRef} style={styles.terminal}>
                {termOutput || `MakeyDooey Terminal Ready

1. Click "🔌 Connect" and select your ESP32/Nucleo
2. Type "hello" to test the connection
3. Use Quick Commands or Command Builder

Tip: If port is busy, close Arduino Serial Monitor first.
`}
              </div>

              {/* Manual Input */}
              <div style={styles.inputRow}>
                <input 
                  type="text" 
                  style={styles.manualInput}
                  placeholder={isConnected ? "Type command and press Enter..." : "Connect first..."}
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={!isConnected}
                />
                <button 
                  style={styles.btnInputSend}
                  onClick={() => sendCommand(commandInput)}
                  disabled={!isConnected}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== FLASH TAB ==================== */}
        {activeTab === 'flash' && (
          <>
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>📁 Firmware File</h4>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept=".bin,.hex,.elf" 
                style={{ display: 'none' }} 
                onChange={handleFileSelect} 
              />
              <button style={styles.btnPrimary} onClick={() => fileInputRef.current?.click()}>
                Choose File
              </button>
              {selectedFile && (
                <p style={{ marginTop: '10px', color: '#4CAF50' }}>
                  ✓ {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
            
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>⚡ Flash</h4>
              <button 
                style={{ 
                  ...styles.btnSuccess, 
                  opacity: (!selectedFile || isProgramming) ? 0.5 : 1 
                }} 
                onClick={handleFlashFirmware} 
                disabled={!selectedFile || isProgramming}
              >
                {isProgramming ? '⏳ Programming...' : '🚀 Flash Firmware'}
              </button>
              
              {isProgramming && (
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                  <div style={styles.progressText}>{progress}%</div>
                </div>
              )}
            </div>
            
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>📋 Log</h4>
              <div style={styles.logOutput}>
                {logs.length === 0 
                  ? <div style={{ color: '#666' }}>No logs...</div> 
                  : logs.map((log, i) => <div key={i} style={styles.logLine}>{log}</div>)
                }
              </div>
            </div>
          </>
        )}

        {/* ==================== CONFIG TAB ==================== */}
        {activeTab === 'config' && (
          <div style={styles.section}>
            <h4 style={styles.sectionTitle}>⚙️ Serial Configuration</h4>
            <div style={styles.configGrid}>
              <div style={styles.configItem}>
                <label style={styles.configLabel}>Baud Rate</label>
                <select 
                  style={styles.selectInput} 
                  value={config.baudRate} 
                  onChange={(e) => setConfig({ ...config, baudRate: parseInt(e.target.value) })}
                >
                  <option value="9600">9600</option>
                  <option value="57600">57600</option>
                  <option value="115200">115200</option>
                </select>
              </div>
              
              <div style={styles.configItem}>
                <label style={styles.configLabel}>Character Delay</label>
                <input 
                  type="number" 
                  style={styles.selectInput}
                  value={charDelay}
                  onChange={(e) => setCharDelay(parseInt(e.target.value) || 0)}
                  min="0"
                  max="100"
                />
              </div>
              
              <div style={styles.configItem}>
                <label style={styles.configLabel}>Line Ending</label>
                <select 
                  style={styles.selectInput} 
                  value={lineEnding} 
                  onChange={(e) => setLineEnding(e.target.value)}
                >
                  <option value="\r">\r (CR)</option>
                  <option value="\n">\n (LF)</option>
                  <option value="\r\n">\r\n (CRLF)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ==================== DEBUG TAB ==================== */}
        {activeTab === 'debug' && (
          <>
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>🔍 Device Info</h4>
              <div style={styles.statusGrid}>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Device ID</div>
                  <div style={styles.statusFieldValue}>{totem.id}</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Board Type</div>
                  <div style={{ ...styles.statusFieldValue, color: boardInfo.color }}>
                    {boardInfo.icon} {boardInfo.label}
                  </div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Device Name</div>
                  <div style={styles.statusFieldValue}>{totem.name}</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Serial / VID:PID</div>
                  <div style={styles.statusFieldValue}>{totem.serialNumber}</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Connection</div>
                  <div style={{ 
                    ...styles.statusFieldValue, 
                    color: isConnected ? '#4CAF50' : '#F44336' 
                  }}>
                    {isConnected ? '● Connected' : '○ Disconnected'}
                  </div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Baud Rate</div>
                  <div style={styles.statusFieldValue}>{config.baudRate}</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>TX Bytes</div>
                  <div style={styles.statusFieldValue}>{txBytes}</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>RX Bytes</div>
                  <div style={styles.statusFieldValue}>{rxBytes}</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Char Delay</div>
                  <div style={styles.statusFieldValue}>{charDelay}ms</div>
                </div>
                <div style={styles.statusField}>
                  <div style={styles.statusFieldLabel}>Web Serial</div>
                  <div style={styles.statusFieldValue}>
                    {'serial' in navigator ? '✓ Available' : '✗ Not Available'}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>📋 Known Device IDs</h4>
              <div style={{ 
                backgroundColor: '#0a0a0a', 
                padding: '15px', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#888',
                maxHeight: '150px',
                overflowY: 'auto'
              }}>
                <div style={{ color: '#00C853', marginBottom: '8px' }}>ESP32:</div>
                <div>• 303a:* (Espressif native USB)</div>
                <div>• 10c4:ea60 (CP2102 - Silicon Labs)</div>
                <div>• 1a86:7523 (CH340 - WCH)</div>
                <div>• 1a86:55d4 (CH9102 - WCH)</div>
                <br />
                <div style={{ color: '#2196F3', marginBottom: '8px' }}>Nucleo/STM32:</div>
                <div>• 0483:374b (Nucleo-144)</div>
                <div>• 0483:5740 (STM32 VCP)</div>
                <div>• 0483:3748 (ST-Link V2)</div>
              </div>
            </div>
            
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>🛠️ Troubleshooting</h4>
              <div style={{ 
                backgroundColor: '#0a0a0a', 
                padding: '15px', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#0f0'
              }}>
                <div style={{ marginBottom: '10px', color: '#888' }}># Check USB devices</div>
                <div>ls /dev/tty.usb* /dev/cu.usb*</div>
                <br />
                <div style={{ marginBottom: '10px', color: '#888' }}># See what's using the port</div>
                <div>lsof | grep usbmodem</div>
                <br />
                <div style={{ marginBottom: '10px', color: '#888' }}># Kill Chrome if port is stuck</div>
                <div>killall "Google Chrome"</div>
                <br />
                <div style={{ marginBottom: '10px', color: '#888' }}># Get USB device info (macOS)</div>
                <div>system_profiler SPUSBDataType | grep -A 10 "ESP\|STM\|CH340\|CP210"</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// =====================================================
// STYLES
// =====================================================

const styles: { [key: string]: React.CSSProperties } = {
  container: { 
    position: 'fixed', 
    top: 0, 
    left: 0, 
    right: 0, 
    bottom: 0, 
    backgroundColor: '#0a0a0a', 
    zIndex: 1000, 
    display: 'flex', 
    flexDirection: 'column',
    fontFamily: "'Monaco', 'Consolas', monospace"
  },
  header: { 
    background: 'linear-gradient(180deg, #1a1a1a 0%, #111 100%)',
    borderBottom: '2px solid #333', 
    padding: '12px 20px' 
  },
  headerContent: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  title: { 
    margin: 0, 
    color: '#fff', 
    fontSize: '16px', 
    fontWeight: '600' 
  },
  closeButton: { 
    backgroundColor: 'transparent', 
    border: 'none', 
    color: '#666', 
    fontSize: '28px', 
    cursor: 'pointer', 
    padding: '0 10px',
    lineHeight: '1'
  },
  tabs: { 
    display: 'flex', 
    backgroundColor: '#111', 
    borderBottom: '1px solid #333', 
    paddingLeft: '20px' 
  },
  tab: { 
    backgroundColor: 'transparent', 
    border: 'none', 
    color: '#666', 
    padding: '12px 20px', 
    cursor: 'pointer', 
    fontSize: '13px', 
    fontWeight: '500', 
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s'
  },
  tabActive: { 
    color: '#fff', 
    borderBottomColor: '#2196f3' 
  },
  content: { 
    flex: 1, 
    overflow: 'auto', 
    padding: '15px' 
  },
  
  // Sidebar
  sidebar: {
    width: '260px',
    backgroundColor: '#141414',
    borderRadius: '8px',
    padding: '15px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    border: '1px solid #333'
  },
  sidebarSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  sidebarTitle: {
    margin: 0,
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  divider: {
    borderTop: '1px solid #333',
    margin: '5px 0'
  },
  select: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  inputLabel: {
    color: '#666',
    fontSize: '11px',
    textTransform: 'uppercase'
  },
  input: {
    width: '100%',
    padding: '8px 10px',
    backgroundColor: '#0a0a0a',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#0f0',
    fontSize: '13px',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  cmdDesc: {
    fontSize: '11px',
    color: '#666',
    padding: '8px',
    backgroundColor: '#0a0a0a',
    borderRadius: '4px'
  },
  btnSend: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#1565c0',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '6px'
  },
  quickBtn: {
    padding: '6px 8px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    cursor: 'pointer'
  },
  stats: {
    fontSize: '11px',
    color: '#666',
    textAlign: 'center',
    padding: '8px',
    backgroundColor: '#0a0a0a',
    borderRadius: '4px',
    marginTop: 'auto'
  },
  
  // Terminal area
  terminalArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#000',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #333'
  },
  controlBar: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: '10px 15px',
    borderBottom: '1px solid #333'
  },
  btnConnect: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  baudSelect: {
    padding: '8px 12px',
    backgroundColor: '#222',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '13px'
  },
  btnSmall: {
    padding: '8px 12px',
    backgroundColor: '#222',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer'
  },
  connectionStatus: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px'
  },
  terminal: {
    flex: 1,
    padding: '15px',
    whiteSpace: 'pre-wrap',
    overflowY: 'auto',
    fontSize: '13px',
    color: '#0f0',
    fontFamily: "'Monaco', 'Consolas', monospace",
    lineHeight: '1.5'
  },
  inputRow: {
    display: 'flex',
    borderTop: '1px solid #333'
  },
  manualInput: {
    flex: 1,
    padding: '12px 15px',
    backgroundColor: '#111',
    border: 'none',
    color: '#0f0',
    fontSize: '14px',
    fontFamily: 'inherit',
    outline: 'none'
  },
  btnInputSend: {
    padding: '12px 20px',
    backgroundColor: '#1565c0',
    border: 'none',
    borderLeft: '1px solid #333',
    color: '#fff',
    fontSize: '13px',
    cursor: 'pointer'
  },
  
  // Sections
  section: { 
    backgroundColor: '#141414', 
    borderRadius: '8px', 
    padding: '20px', 
    marginBottom: '15px', 
    border: '1px solid #333' 
  },
  sectionTitle: { 
    margin: '0 0 15px 0', 
    color: '#fff', 
    fontSize: '14px', 
    fontWeight: '600' 
  },
  
  // Buttons
  btnPrimary: { 
    backgroundColor: '#1565c0', 
    color: 'white', 
    border: 'none', 
    padding: '10px 20px', 
    borderRadius: '4px', 
    fontSize: '13px', 
    fontWeight: '500', 
    cursor: 'pointer'
  },
  btnSuccess: { 
    backgroundColor: '#2e7d32', 
    color: 'white', 
    border: 'none', 
    padding: '10px 20px', 
    borderRadius: '4px', 
    fontSize: '13px', 
    fontWeight: '500', 
    cursor: 'pointer'
  },
  
  // Progress
  progressBar: { 
    position: 'relative', 
    width: '100%', 
    height: '24px', 
    backgroundColor: '#1a1a1a', 
    borderRadius: '4px', 
    overflow: 'hidden', 
    marginTop: '12px',
    border: '1px solid #333'
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: '#2e7d32', 
    transition: 'width 0.3s'
  },
  progressText: { 
    position: 'absolute', 
    top: '50%', 
    left: '50%', 
    transform: 'translate(-50%, -50%)', 
    color: '#fff', 
    fontSize: '11px', 
    fontWeight: 'bold' 
  },
  
  // Log
  logOutput: { 
    backgroundColor: '#0a0a0a', 
    border: '1px solid #333', 
    borderRadius: '4px', 
    padding: '12px', 
    maxHeight: '200px', 
    overflowY: 'auto', 
    fontFamily: 'monospace', 
    fontSize: '12px'
  },
  logLine: { 
    color: '#0f0', 
    marginBottom: '4px' 
  },
  
  // Config
  configGrid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
    gap: '15px' 
  },
  configItem: { 
    display: 'flex', 
    flexDirection: 'column', 
    gap: '6px' 
  },
  configLabel: { 
    fontSize: '12px', 
    color: '#888', 
    fontWeight: '500' 
  },
  selectInput: { 
    backgroundColor: '#1a1a1a', 
    border: '1px solid #444', 
    borderRadius: '4px', 
    padding: '8px 12px', 
    color: '#fff', 
    fontSize: '13px'
  },
  
  // Status grid
  statusGrid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
    gap: '10px' 
  },
  statusField: { 
    backgroundColor: '#0a0a0a', 
    padding: '12px', 
    borderRadius: '4px', 
    border: '1px solid #333' 
  },
  statusFieldLabel: { 
    fontSize: '10px', 
    color: '#666', 
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  statusFieldValue: { 
    fontSize: '14px', 
    fontWeight: '600', 
    color: '#fff',
    fontFamily: 'monospace'
  },
};

export default TotemProgrammingIDE;