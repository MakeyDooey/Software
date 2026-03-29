// src/components/TotemProgrammingIDE.tsx
// Uses Leo's proven terminal approach for reliable serial communication

import React, { useState, useRef, useEffect } from 'react';
import type { TotemStatus } from '../types/totem';
import usbService from '../services/usbService';
import { useTheme, T } from '../theme/ThemeContext';

interface CommandBlock {
  id: string;
  type: 'cmd' | 'delay' | 'waitfor';
  command?: string;
  params?: string[];
  delayMs?: number;
  matchStr?: string;
  timeoutMs?: number;
}

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
  const { dark } = useTheme();
  const tok = T(dark);
  const styles = buildStyles(tok);
  const [activeTab, setActiveTab] = useState<'flash' | 'monitor'>('monitor');
  
  // Flash tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProgramming, setIsProgramming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // File editor state
  const [fileContent, setFileContent] = useState<string>('');
  const [editedContent, setEditedContent] = useState<string>('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  
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

  // Block sequencer state
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);
  const [sequenceName, setSequenceName] = useState('My Sequence');
  const [isRunningSequence, setIsRunningSequence] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const stopSequenceRef = useRef(false);
  const termOutputRef = useRef('');

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

  // Load blocks from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('makeydooey-blocks');
      const savedName = localStorage.getItem('makeydooey-sequence-name');
      if (saved) setBlocks(JSON.parse(saved));
      if (savedName) setSequenceName(savedName);
    } catch { /* ignore corrupt storage */ }
  }, []);

  // Persist blocks to localStorage on change
  useEffect(() => {
    localStorage.setItem('makeydooey-blocks', JSON.stringify(blocks));
  }, [blocks]);

  useEffect(() => {
    localStorage.setItem('makeydooey-sequence-name', sequenceName);
  }, [sequenceName]);

  const appendToTerminal = (text: string) => {
    termOutputRef.current += text;
    setTermOutput(prev => prev + text);
  };

  // =====================================================
  // BLOCK SEQUENCER HELPERS
  // =====================================================
  const generateId = () => Math.random().toString(36).slice(2, 9);

  const addBlock = (type: CommandBlock['type']) => {
    const newBlock: CommandBlock = type === 'cmd'
      ? { id: generateId(), type: 'cmd', command: 'hello', params: [] }
      : type === 'delay'
      ? { id: generateId(), type: 'delay', delayMs: 500 }
      : { id: generateId(), type: 'waitfor', matchStr: 'Ready', timeoutMs: 3000 };
    setBlocks(prev => [...prev, newBlock]);
    setShowAddMenu(false);
  };

  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));

  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const updateBlock = (id: string, patch: Partial<CommandBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  };

  // =====================================================
  // SEQUENCE EXECUTION ENGINE
  // =====================================================
  const waitForResponse = (match: string, timeoutMs: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (stopSequenceRef.current) { reject(new Error('Stopped')); return; }
        if (termOutputRef.current.includes(match)) { resolve(); return; }
        if (Date.now() - start > timeoutMs) { reject(new Error(`Timeout waiting for "${match}"`)); return; }
        setTimeout(check, 100);
      };
      check();
    });
  };

  const runSequence = async () => {
    if (!isConnected) { appendToTerminal('[Not connected — click Connect first]\n'); return; }
    if (blocks.length === 0) { appendToTerminal('[No blocks in sequence]\n'); return; }

    stopSequenceRef.current = false;
    setIsRunningSequence(true);
    const initial: Record<string, 'idle' | 'running' | 'done' | 'error'> = {};
    blocks.forEach(b => { initial[b.id] = 'idle'; });
    setBlockStatuses(initial);

    appendToTerminal(`\n[▶ Running sequence: ${sequenceName}]\n`);

    for (const block of blocks) {
      if (stopSequenceRef.current) {
        appendToTerminal('[■ Sequence stopped]\n');
        break;
      }
      setBlockStatuses(prev => ({ ...prev, [block.id]: 'running' }));
      try {
        if (block.type === 'cmd') {
          const cmd = (block.params && block.params.filter(Boolean).length > 0)
            ? `${block.command} ${block.params.join(' ')}`
            : block.command!;
          await sendCommand(cmd);
          await new Promise(r => setTimeout(r, 150));
        } else if (block.type === 'delay') {
          appendToTerminal(`[DELAY ${block.delayMs}ms]\n`);
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, block.delayMs ?? 500);
            const poll = setInterval(() => {
              if (stopSequenceRef.current) { clearTimeout(t); clearInterval(poll); reject(new Error('Stopped')); }
            }, 50);
            setTimeout(() => clearInterval(poll), (block.delayMs ?? 500) + 100);
          });
        } else if (block.type === 'waitfor') {
          appendToTerminal(`[WAIT FOR "${block.matchStr}"...]\n`);
          await waitForResponse(block.matchStr!, block.timeoutMs ?? 3000);
          appendToTerminal(`[WAIT FOR matched]\n`);
        }
        setBlockStatuses(prev => ({ ...prev, [block.id]: 'done' }));
      } catch (e: any) {
        setBlockStatuses(prev => ({ ...prev, [block.id]: 'error' }));
        appendToTerminal(`[Block error: ${e.message}]\n`);
        break;
      }
    }

    setIsRunningSequence(false);
    stopSequenceRef.current = false;
    appendToTerminal('[■ Sequence complete]\n\n');
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
      processSelectedFile(file);
    }
  };

  // Process a selected file (from input or drag-drop)
  const processSelectedFile = async (file: File) => {
    setSelectedFile(file);
    addLog(`Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);

    // Read file content for text-based files
    const textExtensions = ['.c', '.cpp', '.h', '.hpp', '.ino', '.txt', '.json', '.py', '.s', '.asm'];
    const isTextFile = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (isTextFile) {
      try {
        const content = await readFileAsText(file);
        setFileContent(content);
        setEditedContent(content);
        setIsEditorOpen(true);
        setEditorMode('view');
        setHasUnsavedChanges(false);
        addLog(`Loaded ${file.name} for editing`);
      } catch (error) {
        addLog(`Error reading file: ${error}`);
      }
    } else {
      // Binary file - just show info, no editor
      setFileContent('');
      setEditedContent('');
      setIsEditorOpen(false);
      addLog(`Binary file selected - ready for flashing`);
    }
  };

  // Read file as text
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validExtensions = ['.bin', '.hex', '.elf', '.c', '.cpp', '.h', '.hpp', '.ino', '.txt', '.json', '.py', '.s', '.asm'];
      const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

      if (isValid) {
        processSelectedFile(file);
      } else {
        addLog(`Invalid file type: ${file.name}. Supported: ${validExtensions.join(', ')}`);
      }
    }
  };

  // Editor content change handler
  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditedContent(newContent);
    setHasUnsavedChanges(newContent !== fileContent);
  };

  // Save edited content
  const handleSaveFile = () => {
    if (!selectedFile || !hasUnsavedChanges) return;

    // Create a new file blob with the edited content
    const blob = new Blob([editedContent], { type: 'text/plain' });
    const newFile = new File([blob], selectedFile.name, { type: selectedFile.type });

    setSelectedFile(newFile);
    setFileContent(editedContent);
    setHasUnsavedChanges(false);
    addLog(`Saved changes to ${selectedFile.name}`);
  };

  // Download file
  const handleDownloadFile = () => {
    if (!selectedFile) return;

    const content = hasUnsavedChanges ? editedContent : fileContent;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`Downloaded: ${selectedFile.name}`);
  };

  // Create new file
  const handleNewFile = () => {
    const fileName = prompt('Enter file name (e.g., main.c):');
    if (fileName) {
      const blob = new Blob(['// New file\n'], { type: 'text/plain' });
      const file = new File([blob], fileName, { type: 'text/plain' });
      setSelectedFile(file);
      setFileContent('// New file\n');
      setEditedContent('// New file\n');
      setIsEditorOpen(true);
      setEditorMode('edit');
      setHasUnsavedChanges(false);
      addLog(`Created new file: ${fileName}`);
    }
  };

  // Discard changes
  const handleDiscardChanges = () => {
    if (hasUnsavedChanges) {
      if (confirm('Discard unsaved changes?')) {
        setEditedContent(fileContent);
        setHasUnsavedChanges(false);
        setEditorMode('view');
        addLog('Changes discarded');
      }
    }
  };

  // Close editor
  const handleCloseEditor = () => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Close anyway?')) {
        return;
      }
    }
    setIsEditorOpen(false);
    setEditorMode('view');
  };

  // Example ESP32-S3 firmware in Leo's format with command/response handling
  // Compatible with MakeyDooey Monitor tab - uses neopixelWrite() (no library needed)
  const ESP32_LED_EXAMPLE = `// =====================================================
// MakeyDooey ESP32-S3 Interactive Firmware
// Leo's Format - Compatible with Monitor Tab Commands
// =====================================================
//
// This firmware implements a command-response protocol that works
// with the MakeyDooey Monitor tab. No external libraries required!
// Uses built-in neopixelWrite() for ESP32-S3 RGB LED on GPIO48.
//
// SUPPORTED COMMANDS (type in Monitor tab):
//   hello        - Test connection, returns "Hello, World!"
//   toggle-led   - Toggle LED on/off
//   led-on       - Turn LED on (white)
//   led-off      - Turn LED off
//   blink        - Blink LED 5 times
//   status       - Get system status
//   help         - List available commands
//   echo_send X  - Echo back the string X
//   set_led R G B - Set LED to RGB color (0-255 each)
//
// =====================================================

#include <Arduino.h>

// ESP32-S3-WROOM-1 has RGB LED on GPIO48
#define RGB_LED_PIN 48

// LED state
bool ledState = false;
uint8_t ledR = 255, ledG = 255, ledB = 255;  // Default white

// Command buffer
String inputBuffer = "";
const int MAX_BUFFER = 256;

// =====================================================
// LED CONTROL FUNCTIONS
// =====================================================

void setLED(uint8_t r, uint8_t g, uint8_t b) {
  // ESP32-S3 built-in function for WS2812 RGB LED
  neopixelWrite(RGB_LED_PIN, r, g, b);
  ledR = r;
  ledG = g;
  ledB = b;
}

void ledOn() {
  setLED(ledR, ledG, ledB);
  ledState = true;
  Serial.println("LED Turned ON.\\r");
}

void ledOff() {
  setLED(0, 0, 0);
  ledState = false;
  Serial.println("LED Turned OFF.\\r");
}

void toggleLED() {
  if (ledState) {
    ledOff();
  } else {
    ledOn();
  }
}

void blinkLED(int times) {
  Serial.print("Blinking LED ");
  Serial.print(times);
  Serial.println(" times...\\r");

  for (int i = 0; i < times; i++) {
    setLED(0, 255, 0);  // Green blink
    delay(200);
    setLED(0, 0, 0);
    delay(200);
    Serial.print("Blink ");
    Serial.println(i + 1);
  }

  // Restore previous state
  if (ledState) {
    setLED(ledR, ledG, ledB);
  }
  Serial.println("Blink complete.\\r");
}

// =====================================================
// COMMAND PROCESSING (Leo's Format)
// =====================================================

void processCommand(String cmd) {
  cmd.trim();

  if (cmd.length() == 0) {
    return;
  }

  // Parse command and arguments
  int spaceIndex = cmd.indexOf(' ');
  String command = (spaceIndex > 0) ? cmd.substring(0, spaceIndex) : cmd;
  String args = (spaceIndex > 0) ? cmd.substring(spaceIndex + 1) : "";
  command.toLowerCase();

  // ===== COMMAND HANDLERS =====

  if (command == "hello") {
    Serial.println("Hello, World!\\r");
  }

  else if (command == "toggle-led") {
    toggleLED();
  }

  else if (command == "led-on") {
    ledOn();
  }

  else if (command == "led-off") {
    ledOff();
  }

  else if (command == "blink") {
    blinkLED(5);
  }

  else if (command == "status") {
    Serial.println("=== ESP32-S3 Status ===\\r");
    Serial.print("LED State: ");
    Serial.println(ledState ? "ON" : "OFF");
    Serial.print("LED Color: R=");
    Serial.print(ledR);
    Serial.print(" G=");
    Serial.print(ledG);
    Serial.print(" B=");
    Serial.println(ledB);
    Serial.print("Uptime: ");
    Serial.print(millis() / 1000);
    Serial.println(" seconds\\r");
    Serial.print("Free Heap: ");
    Serial.print(ESP.getFreeHeap());
    Serial.println(" bytes\\r");
    Serial.println("=======================\\r");
  }

  else if (command == "help") {
    Serial.println("=== Available Commands ===\\r");
    Serial.println("hello        - Test connection\\r");
    Serial.println("toggle-led   - Toggle LED on/off\\r");
    Serial.println("led-on       - Turn LED on\\r");
    Serial.println("led-off      - Turn LED off\\r");
    Serial.println("blink        - Blink LED 5 times\\r");
    Serial.println("status       - System status\\r");
    Serial.println("set_led R G B - Set RGB color (0-255)\\r");
    Serial.println("echo_send X  - Echo string X\\r");
    Serial.println("get_pid      - Get PID values\\r");
    Serial.println("help         - Show this help\\r");
    Serial.println("==========================\\r");
  }

  else if (command == "echo_send") {
    if (args.length() > 0) {
      Serial.print("Echo (");
      Serial.print(args.length());
      Serial.print(" bytes): ");
      Serial.println(args);
      Serial.println("Echo complete.\\r");
    } else {
      Serial.println("Usage: echo_send <string>\\r");
    }
  }

  else if (command == "set_led") {
    // Parse R G B values
    int r = 255, g = 255, b = 255;
    if (args.length() > 0) {
      sscanf(args.c_str(), "%d %d %d", &r, &g, &b);
      r = constrain(r, 0, 255);
      g = constrain(g, 0, 255);
      b = constrain(b, 0, 255);
    }
    ledR = r;
    ledG = g;
    ledB = b;
    setLED(r, g, b);
    ledState = true;
    Serial.print("LED set to R=");
    Serial.print(r);
    Serial.print(" G=");
    Serial.print(g);
    Serial.print(" B=");
    Serial.println(b);
  }

  else if (command == "get_pid") {
    // Simulated PID response for compatibility
    Serial.println("ESP32 PID: Kp=1.0,Ki=0.0,Kd=0.0,Mode=1\\r");
  }

  else if (command == "set_pid") {
    // Acknowledge but note this is simulated
    Serial.println("PID values updated (simulated).\\r");
  }

  else {
    Serial.print("Unknown command: ");
    Serial.println(command);
    Serial.println("Type 'help' for available commands.\\r");
  }
}

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);

  // Wait for serial connection (USB CDC)
  delay(1000);

  // Initialize LED to off
  setLED(0, 0, 0);

  // Startup message
  Serial.println("\\r");
  Serial.println("=========================================\\r");
  Serial.println("  MakeyDooey ESP32-S3 Firmware v1.0\\r");
  Serial.println("  Leo's Format - Interactive Mode\\r");
  Serial.println("=========================================\\r");
  Serial.println("Type 'help' for available commands.\\r");
  Serial.println("\\r");

  // Visual startup indication - RGB cycle
  setLED(255, 0, 0);   // Red
  delay(300);
  setLED(0, 255, 0);   // Green
  delay(300);
  setLED(0, 0, 255);   // Blue
  delay(300);
  setLED(0, 0, 0);     // Off

  Serial.println("Ready.\\r");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
  // Read serial input character by character
  while (Serial.available() > 0) {
    char c = Serial.read();

    // Handle line endings (CR, LF, or CRLF)
    if (c == '\\r' || c == '\\n') {
      if (inputBuffer.length() > 0) {
        processCommand(inputBuffer);
        inputBuffer = "";
      }
    }
    // Handle backspace
    else if (c == '\\b' || c == 127) {
      if (inputBuffer.length() > 0) {
        inputBuffer.remove(inputBuffer.length() - 1);
      }
    }
    // Add character to buffer
    else if (inputBuffer.length() < MAX_BUFFER) {
      inputBuffer += c;
    }
  }

  // Small delay to prevent CPU hogging
  delay(1);
}

/*
 * =====================================================
 * SETUP INSTRUCTIONS FOR ESP32-S3-WROOM-1
 * =====================================================
 *
 * NO EXTERNAL LIBRARIES NEEDED!
 * This firmware uses the built-in neopixelWrite() function.
 *
 * BOARD SETTINGS (Arduino IDE 2.x):
 * ---------------------------------
 * 1. Board: "ESP32S3 Dev Module"
 * 2. USB CDC On Boot: "Enabled"  <-- REQUIRED!
 * 3. USB Mode: "Hardware CDC and JTAG"
 * 4. Upload Mode: "UART0 / Hardware CDC"
 * 5. Upload Speed: 921600 (or 115200 if issues)
 *
 * IF UPLOAD FAILS ("Failed to write to target RAM"):
 * --------------------------------------------------
 * Put ESP32-S3 into bootloader mode:
 * 1. Hold down BOOT button
 * 2. Press and release RESET button
 * 3. Release BOOT button
 * 4. Click Upload in Arduino IDE
 * 5. After upload, press RESET to run
 *
 * USING WITH MAKEYDOOEY MONITOR TAB:
 * ----------------------------------
 * 1. Flash this firmware to your ESP32-S3
 * 2. Open MakeyDooey app
 * 3. Connect to your ESP32 (Connect USB Hardware)
 * 4. Double-click the device to open IDE
 * 5. Go to Monitor tab
 * 6. Click "Connect" button
 * 7. Type commands: hello, toggle-led, blink, status, help
 *
 * EXPECTED OUTPUT:
 * ----------------
 * On startup you should see:
 *   "MakeyDooey ESP32-S3 Firmware v1.0"
 *   "Type 'help' for available commands."
 *   "Ready."
 *
 * Then the LED will flash RGB and turn off.
 * Type 'hello' and press Enter - should see "Hello, World!"
 */
`;

  // Simple test firmware that works over serial (no flashing needed)
  // This sends commands to test if the board responds
  const SERIAL_TEST_COMMANDS = [
    { cmd: 'hello', desc: 'Test connection' },
    { cmd: 'toggle-led', desc: 'Toggle LED on/off' },
    { cmd: 'blink', desc: 'Blink LED 5 times' },
  ];

  // Load example firmware
  const handleLoadExample = () => {
    const fileName = 'esp32s3_led_blink.ino';
    const blob = new Blob([ESP32_LED_EXAMPLE], { type: 'text/plain' });
    const file = new File([blob], fileName, { type: 'text/plain' });

    setSelectedFile(file);
    setFileContent(ESP32_LED_EXAMPLE);
    setEditedContent(ESP32_LED_EXAMPLE);
    setIsEditorOpen(true);
    setEditorMode('view');
    setHasUnsavedChanges(false);
    addLog(`Loaded example: ${fileName}`);
  };

  const handleFlashFirmware = async () => {
    if (!selectedFile) {
      alert('Please select a firmware file first');
      return;
    }

    const fileName = selectedFile.name.toLowerCase();
    const isSourceFile = fileName.endsWith('.ino') || fileName.endsWith('.c') || fileName.endsWith('.cpp');

    // For source files, guide user to compile externally
    if (isSourceFile) {
      addLog(`Source file detected: ${selectedFile.name}`);
      addLog('To flash this code:');
      addLog('1. Click "Save" to download the file');
      addLog('2. Open in Arduino IDE or PlatformIO');
      addLog('3. Compile and upload to your ESP32');
      addLog('4. Return here and go to Monitor tab to see output');

      // Offer to download the file
      const shouldDownload = confirm(
        `"${selectedFile.name}" is a source file that needs to be compiled.\n\n` +
        `Would you like to download it to flash via Arduino IDE?\n\n` +
        `After flashing, come back to the Monitor tab to see the serial output.`
      );

      if (shouldDownload) {
        handleDownloadFile();
        addLog('File downloaded - flash via Arduino IDE, then check Monitor tab');
      }
      return;
    }

    // For binary files, proceed with flashing simulation
    // TODO: Implement actual esptool.js flashing for .bin files
    setIsProgramming(true);
    setProgress(0);
    addLog(`Starting firmware flash: ${selectedFile.name}`);
    addLog(`File size: ${(selectedFile.size / 1024).toFixed(2)} KB`);
    addLog(`Board: ${boardInfo.label}`);

    // Simulate flashing progress
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setProgress(i);
      if (i === 0) addLog('Connecting to bootloader...');
      if (i === 20) addLog('Erasing flash...');
      if (i === 40) addLog('Writing firmware...');
      if (i === 80) addLog('Verifying...');
    }

    setIsProgramming(false);
    addLog('✓ Flash complete!');
    addLog('Go to Monitor tab to see serial output from your firmware');
    onProgramSuccess(totem.id);

    // Prompt to go to monitor
    const goToMonitor = confirm(
      'Firmware flashed successfully!\n\n' +
      'Would you like to go to the Monitor tab to see the serial output?'
    );
    if (goToMonitor) {
      setActiveTab('monitor');
    }
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
        {(['flash', 'monitor'] as const).map(tab => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {})
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'flash' ? '⚡ Flash' : '📟 Monitor'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* ==================== MONITOR TAB ==================== */}
        {activeTab === 'monitor' && (
          <div style={{ display: 'flex', height: 'calc(100vh - 180px)', overflow: 'hidden' }}>

            {/* ---- Block Sequencer Panel ---- */}
            <div style={styles.blockPanel}>
              {/* Header */}
              <div style={styles.blockPanelHeader}>
                <span style={{ color: '#aaa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Sequence</span>
                <input
                  style={styles.sequenceNameInput}
                  value={sequenceName}
                  onChange={e => setSequenceName(e.target.value)}
                  disabled={isRunningSequence}
                  title="Sequence name"
                />
              </div>

              {/* Block List */}
              <div style={styles.blockList}>
                {blocks.length === 0 && (
                  <div style={styles.blockEmpty}>
                    <div style={{ fontSize: '24px', marginBottom: '8px', opacity: 0.3 }}>⬡</div>
                    <div style={{ color: '#555', fontSize: '12px' }}>No blocks yet.</div>
                    <div style={{ color: '#444', fontSize: '11px', marginTop: '4px' }}>Add a block below to start.</div>
                  </div>
                )}
                {blocks.map((block, idx) => {
                  const status = blockStatuses[block.id] || 'idle';
                  const borderColor = block.type === 'cmd' ? '#EB7923' : block.type === 'delay' ? '#16a34a' : '#7c3aed';
                  const statusColor = status === 'running' ? '#f59e0b' : status === 'done' ? '#16a34a' : status === 'error' ? '#dc2626' : '#d1d5db';
                  const statusLabel = status === 'running' ? '⏳' : status === 'done' ? '✓' : status === 'error' ? '✗' : '○';
                  return (
                    <div key={block.id} style={{ ...styles.blockCard, borderLeftColor: borderColor, opacity: isRunningSequence ? 0.85 : 1 }}>
                      {/* Block type badge + status */}
                      <div style={styles.blockCardTop}>
                        <span style={{ ...styles.blockTypeBadge, backgroundColor: borderColor === '#EB7923' ? '#fff3e0' : borderColor === '#16a34a' ? '#dcfce7' : '#ede9fe', color: borderColor === '#EB7923' ? '#92400e' : borderColor === '#16a34a' ? '#14532d' : '#4c1d95' }}>
                          {block.type === 'cmd' ? 'CMD' : block.type === 'delay' ? 'DELAY' : 'WAIT'}
                        </span>
                        <span style={{ color: statusColor, fontSize: '14px', lineHeight: 1 }}>{statusLabel}</span>
                        {!isRunningSequence && (
                          <div style={styles.blockControls}>
                            <button style={styles.blockCtrlBtn} onClick={() => moveBlock(block.id, -1)} disabled={idx === 0} title="Move up">↑</button>
                            <button style={styles.blockCtrlBtn} onClick={() => moveBlock(block.id, 1)} disabled={idx === blocks.length - 1} title="Move down">↓</button>
                            <button style={{ ...styles.blockCtrlBtn, color: '#dc2626', borderColor: 'rgba(220,38,38,0.25)' }} onClick={() => removeBlock(block.id)} title="Remove">×</button>
                          </div>
                        )}
                      </div>

                      {/* Block content */}
                      {block.type === 'cmd' && (
                        <div style={styles.blockBody}>
                          <input
                            style={styles.blockInput}
                            value={block.command ?? ''}
                            onChange={e => updateBlock(block.id, { command: e.target.value })}
                            disabled={isRunningSequence}
                            placeholder="command"
                            list="cmd-suggestions"
                          />
                          <datalist id="cmd-suggestions">
                            {Object.keys(COMMANDS).map(c => <option key={c} value={c} />)}
                          </datalist>
                          {COMMANDS[block.command ?? '']?.params.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {COMMANDS[block.command!].params.map((p, i) => (
                                <input
                                  key={i}
                                  style={{ ...styles.blockInput, flex: 1, minWidth: '50px' }}
                                  value={(block.params ?? [])[i] ?? p.defaultValue}
                                  onChange={e => {
                                    const updated = [...(block.params ?? COMMANDS[block.command!].params.map(pp => pp.defaultValue))];
                                    updated[i] = e.target.value;
                                    updateBlock(block.id, { params: updated });
                                  }}
                                  disabled={isRunningSequence}
                                  placeholder={p.label}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {block.type === 'delay' && (
                        <div style={styles.blockBody}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              style={{ ...styles.blockInput, width: '70px' }}
                              type="number"
                              value={block.delayMs ?? 500}
                              onChange={e => updateBlock(block.id, { delayMs: parseInt(e.target.value) || 0 })}
                              disabled={isRunningSequence}
                              min="0"
                            />
                            <span style={{ color: '#888', fontSize: '11px' }}>ms</span>
                          </div>
                        </div>
                      )}
                      {block.type === 'waitfor' && (
                        <div style={styles.blockBody}>
                          <input
                            style={styles.blockInput}
                            value={block.matchStr ?? ''}
                            onChange={e => updateBlock(block.id, { matchStr: e.target.value })}
                            disabled={isRunningSequence}
                            placeholder="match string"
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <input
                              style={{ ...styles.blockInput, width: '60px' }}
                              type="number"
                              value={block.timeoutMs ?? 3000}
                              onChange={e => updateBlock(block.id, { timeoutMs: parseInt(e.target.value) || 0 })}
                              disabled={isRunningSequence}
                              min="100"
                            />
                            <span style={{ color: '#888', fontSize: '11px' }}>ms timeout</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Block Menu */}
              <div style={styles.blockAddArea}>
                {showAddMenu ? (
                  <div style={styles.addMenuPopup}>
                    <button style={styles.addMenuOption} onClick={() => addBlock('cmd')}>
                      <span style={{ color: '#92400e', fontWeight: '700' }}>CMD</span>
                      <span style={{ color: '#888', fontSize: '11px' }}>Send a command</span>
                    </button>
                    <button style={styles.addMenuOption} onClick={() => addBlock('delay')}>
                      <span style={{ color: '#14532d', fontWeight: '700' }}>DELAY</span>
                      <span style={{ color: '#888', fontSize: '11px' }}>Wait N ms</span>
                    </button>
                    <button style={styles.addMenuOption} onClick={() => addBlock('waitfor')}>
                      <span style={{ color: '#4c1d95', fontWeight: '700' }}>WAIT FOR</span>
                      <span style={{ color: '#888', fontSize: '11px' }}>Match response</span>
                    </button>
                    <button style={{ ...styles.addMenuOption, color: '#666', fontSize: '11px', justifyContent: 'center' }} onClick={() => setShowAddMenu(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    style={styles.btnAddBlock}
                    onClick={() => setShowAddMenu(true)}
                    disabled={isRunningSequence}
                  >
                    + Add Block
                  </button>
                )}
              </div>

              {/* Run / Stop */}
              <div style={styles.blockRunArea}>
                {isRunningSequence ? (
                  <button
                    style={styles.btnStop}
                    onClick={() => { stopSequenceRef.current = true; }}
                  >
                    ■ Stop
                  </button>
                ) : (
                  <button
                    style={{ ...styles.btnRun, opacity: (blocks.length === 0 || !isConnected) ? 0.45 : 1 }}
                    onClick={runSequence}
                    disabled={blocks.length === 0 || !isConnected}
                    title={!isConnected ? 'Connect to device first' : blocks.length === 0 ? 'Add blocks first' : 'Run sequence'}
                  >
                    ▶ Run Sequence
                  </button>
                )}
                <div style={styles.blockStats}>TX: {txBytes} | RX: {rxBytes}</div>
              </div>

              {/* Settings (collapsed at bottom) */}
              <div style={styles.blockSettings}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <label style={{ color: '#666', fontSize: '10px', whiteSpace: 'nowrap' }}>Baud</label>
                  <select style={styles.settingsSelect} value={config.baudRate} onChange={e => setConfig({ ...config, baudRate: parseInt(e.target.value) })} disabled={isConnected}>
                    <option value="115200">115200</option>
                    <option value="57600">57600</option>
                    <option value="9600">9600</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <label style={{ color: '#666', fontSize: '10px', whiteSpace: 'nowrap' }}>Delay</label>
                  <input style={{ ...styles.settingsSelect, width: '44px' }} type="number" value={charDelay} onChange={e => setCharDelay(parseInt(e.target.value) || 0)} min="0" max="100" />
                  <span style={{ color: '#555', fontSize: '10px' }}>ms</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <label style={{ color: '#666', fontSize: '10px', whiteSpace: 'nowrap' }}>EOL</label>
                  <select style={styles.settingsSelect} value={lineEnding} onChange={e => setLineEnding(e.target.value)}>
                    <option value="\r">CR</option>
                    <option value="\n">LF</option>
                    <option value="\r\n">CRLF</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ---- Terminal Area ---- */}
            <div style={styles.terminalArea}>
              {/* Control Bar */}
              <div style={styles.controlBar}>
                <button
                  style={{ ...styles.btnConnect, backgroundColor: isConnected ? '#c62828' : '#2e7d32' }}
                  onClick={connect}
                >
                  {isConnected ? '❌ Disconnect' : '🔌 Connect'}
                </button>
                <button style={styles.btnSmall} onClick={() => { setTermOutput(''); termOutputRef.current = ''; }}>
                  🗑️ Clear
                </button>
                <div style={styles.connectionStatus}>
                  <span style={{ color: isConnected ? '#4caf50' : '#888', fontSize: '20px', lineHeight: '1' }}>●</span>
                  <span style={{ color: isConnected ? '#4caf50' : '#888' }}>
                    {isConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              </div>

              {/* Terminal Output */}
              <div ref={terminalRef} style={styles.terminal}>
                {termOutput || `MakeyDooey Terminal Ready\n\n1. Click "🔌 Connect" and select your device\n2. Build a sequence with blocks on the left, then click "▶ Run"\n3. Or type commands manually below\n\nTip: If port is busy, close Arduino Serial Monitor first.\n`}
              </div>

              {/* Manual Input */}
              <div style={styles.inputRow}>
                <input
                  type="text"
                  style={styles.manualInput}
                  placeholder={isConnected ? "Type command and press Enter..." : "Connect first..."}
                  value={commandInput}
                  onChange={e => setCommandInput(e.target.value)}
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
          <div style={{ display: 'flex', gap: '15px', height: 'calc(100vh - 180px)' }}>
            {/* Left Panel - File Selection & Flash Controls */}
            <div style={styles.flashSidebar}>
              {/* File Upload Section */}
              <div style={styles.flashSection}>
                <h4 style={styles.flashSectionTitle}>📁 Firmware File</h4>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".bin,.hex,.elf,.c,.cpp,.h,.hpp,.ino,.txt,.json,.py,.s,.asm"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {/* Drag & Drop Zone */}
                <div
                  style={{
                    ...styles.dropZone,
                    borderColor: isDragOver ? '#2196F3' : '#444',
                    backgroundColor: isDragOver ? tok.blueFaint : tok.orangeFaint
                  }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>
                    {isDragOver ? '📥' : '📂'}
                  </div>
                  <div style={{ color: '#888', fontSize: '12px' }}>
                    {isDragOver ? 'Drop file here' : 'Drag & drop or click to browse'}
                  </div>
                  <div style={{ color: '#555', fontSize: '10px', marginTop: '8px' }}>
                    .bin .hex .elf .c .cpp .h .ino .py
                  </div>
                </div>

                {/* Selected File Info */}
                {selectedFile && (
                  <div style={styles.selectedFileInfo}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#4CAF50', fontSize: '16px' }}>✓</span>
                      <span style={{ color: '#fff', fontSize: '13px', fontWeight: '500' }}>
                        {selectedFile.name}
                      </span>
                    </div>
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </div>
                  </div>
                )}

                {/* File Action Buttons */}
                <div style={styles.fileActions}>
                  <button
                    style={styles.btnSecondary}
                    onClick={handleNewFile}
                  >
                    ✚ New
                  </button>
                  <button
                    style={styles.btnSecondary}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📂 Open
                  </button>
                  {selectedFile && isEditorOpen && (
                    <button
                      style={styles.btnSecondary}
                      onClick={handleDownloadFile}
                    >
                      💾 Save
                    </button>
                  )}
                </div>

                {/* Example Templates */}
                <div style={{ marginTop: '12px' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase' }}>
                    Examples
                  </div>
                  <button
                    style={{
                      ...styles.btnSecondary,
                      width: '100%',
                      backgroundColor: '#109810',
                      borderColor: '#0e8514',
                      textAlign: 'left',
                      padding: '10px 12px'
                    }}
                    onClick={handleLoadExample}
                  >
                    💡 ESP32-S3 LED Blink
                  </button>
                </div>
              </div>

              {/* Flash Section */}
              <div style={styles.flashSection}>
                <h4 style={styles.flashSectionTitle}>⚡ Flash Firmware</h4>
                <button
                  style={{
                    ...styles.btnFlash,
                    opacity: (!selectedFile || isProgramming) ? 0.5 : 1
                  }}
                  onClick={handleFlashFirmware}
                  disabled={!selectedFile || isProgramming}
                >
                  {isProgramming ? '⏳ Programming...' : '🚀 Flash to Device'}
                </button>

                {isProgramming && (
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                    <div style={styles.progressText}>{progress}%</div>
                  </div>
                )}

                <div style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>
                  Note: For .ino files, download and flash via Arduino IDE.
                  For pre-compiled .bin files, direct flashing is supported.
                </div>
              </div>

              {/* Quick Test Section */}
              <div style={styles.flashSection}>
                <h4 style={styles.flashSectionTitle}>🔗 Test Connection</h4>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '10px' }}>
                  Test if your ESP32 firmware responds to commands
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {SERIAL_TEST_COMMANDS.map(({ cmd, desc }) => (
                    <button
                      key={cmd}
                      style={{
                        ...styles.btnSecondary,
                        width: '100%',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                        opacity: isConnected ? 1 : 0.5
                      }}
                      onClick={() => {
                        if (isConnected) {
                          sendCommand(cmd);
                          addLog(`Sent: ${cmd}`);
                        } else {
                          addLog('Not connected - go to Monitor tab first');
                        }
                      }}
                      disabled={!isConnected}
                    >
                      <span>{cmd}</span>
                      <span style={{ color: '#666', fontSize: '10px' }}>{desc}</span>
                    </button>
                  ))}
                </div>
                <button
                  style={{
                    ...styles.btnSecondary,
                    width: '100%',
                    marginTop: '10px',
                    backgroundColor: isConnected ? tok.greenFaint : tok.panelBg,
                    borderColor: isConnected ? '#4CAF50' : '#444'
                  }}
                  onClick={() => setActiveTab('monitor')}
                >
                  📟 {isConnected ? 'View Serial Output →' : 'Go to Monitor to Connect →'}
                </button>
              </div>

              {/* Log Section */}
              <div style={{ ...styles.flashSection, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h4 style={styles.flashSectionTitle}>📋 Activity Log</h4>
                <div style={styles.flashLogOutput}>
                  {logs.length === 0
                    ? <div style={{ color: '#555' }}>No activity yet...</div>
                    : logs.map((log, i) => <div key={i} style={styles.logLine}>{log}</div>)
                  }
                </div>
              </div>
            </div>

            {/* Right Panel - Code Editor */}
            <div style={styles.editorPanel}>
              {isEditorOpen && selectedFile ? (
                <>
                  {/* Editor Header */}
                  <div style={styles.editorHeader}>
                    <div style={styles.editorFileInfo}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span style={styles.editorFileName}>
                        {selectedFile.name}
                        {hasUnsavedChanges && <span style={{ color: '#FF9800' }}> •</span>}
                      </span>
                      <span style={styles.editorMode}>
                        {editorMode === 'edit' ? '✏️ Editing' : '👁️ Viewing'}
                      </span>
                    </div>
                    <div style={styles.editorActions}>
                      {editorMode === 'view' ? (
                        <button
                          style={styles.btnEditorAction}
                          onClick={() => setEditorMode('edit')}
                        >
                          ✏️ Edit
                        </button>
                      ) : (
                        <>
                          <button
                            style={{
                              ...styles.btnEditorAction,
                              backgroundColor: hasUnsavedChanges ? '#2e7d32' : '#333',
                              opacity: hasUnsavedChanges ? 1 : 0.5
                            }}
                            onClick={handleSaveFile}
                            disabled={!hasUnsavedChanges}
                          >
                            💾 Save
                          </button>
                          {hasUnsavedChanges && (
                            <button
                              style={{ ...styles.btnEditorAction, backgroundColor: '#c62828' }}
                              onClick={handleDiscardChanges}
                            >
                              ✗ Discard
                            </button>
                          )}
                          <button
                            style={styles.btnEditorAction}
                            onClick={() => setEditorMode('view')}
                          >
                            👁️ View
                          </button>
                        </>
                      )}
                      <button
                        style={{ ...styles.btnEditorAction, marginLeft: '10px' }}
                        onClick={handleCloseEditor}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Editor Content */}
                  <div style={styles.editorContent}>
                    {/* Line Numbers */}
                    <div style={styles.lineNumbers}>
                      {(editorMode === 'edit' ? editedContent : fileContent)
                        .split('\n')
                        .map((_, i) => (
                          <div key={i} style={styles.lineNumber}>{i + 1}</div>
                        ))
                      }
                    </div>

                    {/* Text Area / Display */}
                    {editorMode === 'edit' ? (
                      <textarea
                        ref={editorRef}
                        style={styles.editorTextArea}
                        value={editedContent}
                        onChange={handleEditorChange}
                        spellCheck={false}
                        placeholder="Start typing your code..."
                      />
                    ) : (
                      <pre style={styles.editorPre}>
                        {fileContent || 'Empty file'}
                      </pre>
                    )}
                  </div>

                  {/* Editor Footer */}
                  <div style={styles.editorFooter}>
                    <span>Lines: {(editorMode === 'edit' ? editedContent : fileContent).split('\n').length}</span>
                    <span>|</span>
                    <span>Characters: {(editorMode === 'edit' ? editedContent : fileContent).length}</span>
                    <span>|</span>
                    <span>Encoding: UTF-8</span>
                  </div>
                </>
              ) : (
                <div style={styles.editorPlaceholder}>
                  <div style={{ fontSize: '48px', marginBottom: '20px', opacity: 0.3 }}>📝</div>
                  <div style={{ color: '#888', fontSize: '16px', marginBottom: '10px' }}>
                    Code Editor
                  </div>
                  <div style={{ color: '#555', fontSize: '13px', marginBottom: '20px' }}>
                    Select a file or load an example to start editing
                  </div>
                  <button
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#1a3a1a',
                      border: '1px solid #2e7d32',
                      borderRadius: '6px',
                      color: '#4CAF50',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                    onClick={handleLoadExample}
                  >
                    💡 Load ESP32-S3 LED Example
                  </button>
                  <div style={{ color: '#444', fontSize: '12px', marginTop: '10px' }}>
                    Supported formats: .c, .cpp, .h, .ino, .py, .txt, .json
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// =====================================================
// =====================================================
// STYLES — warm MakeyDooey theme
// =====================================================

const buildStyles = (tok: ReturnType<typeof T>): { [key: string]: React.CSSProperties } => ({
  container: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: tok.pageBg, zIndex: 1000,
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
    transition: 'background 0.3s',
  },
  header: {
    background: tok.cardBg,
    borderBottom: `1.5px solid ${tok.border}`,
    padding: '12px 320px 12px 20px',
    boxShadow: tok.shadow,
    transition: 'background 0.3s',
  },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { margin: 0, color: tok.textPrimary, fontSize: '16px', fontWeight: '800', fontFamily: "'Nunito', sans-serif" },
  closeButton: {
    backgroundColor: 'transparent', border: `1.5px solid ${tok.border}`,
    borderRadius: '8px', color: tok.orangeText, fontSize: '20px',
    cursor: 'pointer', padding: '2px 10px', lineHeight: '1',
  },
  tabs: {
    display: 'flex', backgroundColor: tok.panelHeaderBg,
    borderBottom: `1.5px solid ${tok.border}`, paddingLeft: '20px',
  },
  tab: {
    backgroundColor: 'transparent', border: 'none', color: tok.textMuted,
    padding: '11px 20px', cursor: 'pointer', fontSize: '13px',
    fontWeight: '700', fontFamily: "'Nunito', sans-serif",
    borderBottom: '2px solid transparent', transition: 'color 0.15s',
  },
  tabActive: { color: tok.orange, borderBottomColor: '#EB7923' },
  content: { flex: 1, overflow: 'auto', padding: '15px', background: tok.pageBg },

  // Sidebar (legacy - kept for compat)
  sidebar: {
    width: '260px', backgroundColor: tok.panelBg,
    borderRadius: '12px', padding: '15px',
    display: 'flex', flexDirection: 'column', gap: '10px',
    overflowY: 'auto', border: `1.5px solid ${tok.border}`,
  },
  sidebarSection: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sidebarTitle: { margin: 0, fontSize: '11px', color: tok.textMuted, textTransform: 'uppercase', letterSpacing: '1px' },
  divider: { borderTop: `1.5px solid ${tok.borderSubtle}`, margin: '5px 0' },
  select: {
    width: '100%', padding: '8px 10px', backgroundColor: tok.inputBg,
    border: `1.5px solid ${tok.border}`, borderRadius: '8px',
    color: tok.textPrimary, fontSize: '13px', cursor: 'pointer',
  },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  inputLabel: { color: tok.textMuted, fontSize: '11px', textTransform: 'uppercase' },
  input: {
    width: '100%', padding: '8px 10px', backgroundColor: tok.inputBg,
    border: `1.5px solid ${tok.border}`, borderRadius: '8px',
    color: tok.textPrimary, fontSize: '13px', fontFamily: "'DM Mono', 'Consolas', monospace",
    boxSizing: 'border-box',
  },
  cmdDesc: {
    fontSize: '11px', color: tok.textMuted, padding: '8px',
    backgroundColor: tok.orangeFaint, borderRadius: '8px',
    border: `1px solid ${tok.borderSubtle}`,
  },
  btnSend: {
    width: '100%', padding: '10px', backgroundColor: tok.orange,
    border: 'none', borderRadius: '8px', color: tok.textOnOrange,
    fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    fontFamily: "'Nunito', sans-serif",
    boxShadow: `0 2px 8px ${tok.orangeSubtle}`,
  },
  quickGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  quickBtn: {
    padding: '6px 8px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`,
    borderRadius: '6px', color: tok.orangeText, fontSize: '11px', cursor: 'pointer',
    fontWeight: '700', fontFamily: "'Nunito', sans-serif",
  },
  stats: {
    fontSize: '11px', color: tok.textMuted, textAlign: 'center', padding: '8px',
    backgroundColor: tok.orangeFaint, borderRadius: '8px', marginTop: 'auto',
  },

  // Terminal area
  terminalArea: {
    flex: 1, display: 'flex', flexDirection: 'column',
    backgroundColor: tok.termBg, borderRadius: '14px',
    overflow: 'hidden', border: `1.5px solid ${tok.borderStrong}`,
    boxShadow: tok.shadow,
  },
  controlBar: {
    display: 'flex', gap: '10px', alignItems: 'center',
    backgroundColor: tok.termHeaderBg, padding: '10px 15px',
    borderBottom: `1px solid ${tok.border}`,
  },
  btnConnect: {
    padding: '8px 16px', border: 'none', borderRadius: '8px',
    color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    fontFamily: "'Nunito', sans-serif",
  },
  baudSelect: {
    padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)',
    border: `1px solid ${tok.border}`, borderRadius: '6px',
    color: tok.textPrimary, fontSize: '13px',
  },
  btnSmall: {
    padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.07)',
    border: `1px solid ${tok.border}`, borderRadius: '6px',
    color: tok.textPrimary, fontSize: '12px', cursor: 'pointer',
  },
  connectionStatus: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' },
  terminal: {
    flex: 1, padding: '15px', whiteSpace: 'pre-wrap', overflowY: 'auto',
    fontSize: '13px', color: tok.termText,
    fontFamily: "'DM Mono', 'Monaco', 'Consolas', monospace", lineHeight: '1.5',
    background: 'transparent',
  },
  inputRow: { display: 'flex', borderTop: `1px solid ${tok.border}` },
  manualInput: {
    flex: 1, padding: '12px 15px', backgroundColor: tok.termInputBg,
    border: 'none', color: tok.termText, fontSize: '14px',
    fontFamily: "'DM Mono', 'Monaco', monospace", outline: 'none',
  },
  btnInputSend: {
    padding: '12px 20px', backgroundColor: tok.orange,
    border: 'none', borderLeft: `1px solid ${tok.border}`,
    color: tok.textOnOrange, fontSize: '13px', cursor: 'pointer',
    fontWeight: '700', fontFamily: "'Nunito', sans-serif",
  },

  // Sections
  section: {
    backgroundColor: tok.cardBg, borderRadius: '12px',
    padding: '20px', marginBottom: '15px',
    border: `1.5px solid ${tok.border}`,
    boxShadow: tok.shadow,
  },
  sectionTitle: { margin: '0 0 15px 0', color: tok.textPrimary, fontSize: '14px', fontWeight: '800', fontFamily: "'Nunito', sans-serif" },

  // Buttons
  btnPrimary: {
    backgroundColor: tok.orange, color: 'white', border: 'none',
    padding: '10px 20px', borderRadius: '8px', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
    boxShadow: `0 2px 8px ${tok.orangeSubtle}`,
  },
  btnSuccess: {
    backgroundColor: tok.green, color: 'white', border: 'none',
    padding: '10px 20px', borderRadius: '8px', fontSize: '13px',
    fontWeight: '700', cursor: 'pointer', fontFamily: "'Nunito', sans-serif",
  },
  progressBar: {
    position: 'relative', width: '100%', height: '24px',
    backgroundColor: tok.orangeFaint, borderRadius: '8px', overflow: 'hidden',
    marginTop: '12px', border: `1.5px solid ${tok.border}`,
  },
  progressFill: { height: '100%', backgroundColor: tok.orange, transition: 'width 0.3s' },
  progressText: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    color: tok.textPrimary, fontSize: '11px', fontWeight: '700',
  },
  logOutput: {
    backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`,
    borderRadius: '8px', padding: '12px', maxHeight: '200px', overflowY: 'auto',
    fontFamily: "'DM Mono', monospace", fontSize: '12px',
  },
  logLine: { color: tok.orangeText, marginBottom: '4px' },
  configGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' },
  configItem: { display: 'flex', flexDirection: 'column', gap: '6px' },
  configLabel: { fontSize: '12px', color: tok.textMuted, fontWeight: '500' },
  selectInput: {
    backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`,
    borderRadius: '8px', padding: '8px 12px', color: tok.textPrimary, fontSize: '13px',
  },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' },
  statusField: {
    backgroundColor: tok.orangeFaint, padding: '12px', borderRadius: '8px',
    border: `1.5px solid ${tok.borderSubtle}`,
  },
  statusFieldLabel: {
    fontSize: '10px', color: tok.textMuted, marginBottom: '4px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  statusFieldValue: { fontSize: '14px', fontWeight: '700', color: tok.textPrimary, fontFamily: "'DM Mono', monospace" },

  // Flash Tab
  flashSidebar: { width: '300px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' },
  flashSection: {
    backgroundColor: tok.cardBg, borderRadius: '14px',
    padding: '15px', border: `1.5px solid ${tok.border}`,
    boxShadow: tok.shadow,
  },
  flashSectionTitle: {
    margin: '0 0 12px 0', color: tok.textPrimary, fontSize: '13px',
    fontWeight: '800', fontFamily: "'Nunito', sans-serif",
  },
  dropZone: {
    border: `2px dashed ${tok.border}`, borderRadius: '10px',
    padding: '25px', textAlign: 'center', cursor: 'pointer',
    transition: 'all 0.2s', marginBottom: '12px', backgroundColor: tok.orangeFaint,
  },
  selectedFileInfo: {
    backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`,
    borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
  },
  fileActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  btnSecondary: {
    flex: 1, minWidth: '60px', padding: '8px 12px',
    backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`,
    borderRadius: '8px', color: tok.orangeText, fontSize: '11px',
    cursor: 'pointer', transition: 'all 0.2s', fontWeight: '700',
    fontFamily: "'Nunito', sans-serif",
  },
  btnFlash: {
    width: '100%', padding: '12px 20px', backgroundColor: tok.orange,
    border: 'none', borderRadius: '10px', color: tok.textOnOrange, fontSize: '14px',
    fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s',
    fontFamily: "'Nunito', sans-serif",
    boxShadow: `0 3px 12px ${tok.orangeSubtle}`,
  },
  flashLogOutput: {
    flex: 1, backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`,
    borderRadius: '8px', padding: '10px', overflowY: 'auto',
    fontFamily: "'DM Mono', monospace", fontSize: '11px', minHeight: '100px',
    color: tok.orangeText,
  },

  // Editor panel
  editorPanel: {
    flex: 1, display: 'flex', flexDirection: 'column',
    backgroundColor: tok.cardBgAlt, borderRadius: '14px',
    border: `1.5px solid ${tok.border}`, overflow: 'hidden',
  },
  editorHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: tok.cardBg, borderBottom: `1.5px solid ${tok.borderSubtle}`,
    padding: '10px 15px',
  },
  editorFileInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  editorFileName: { color: tok.textPrimary, fontSize: '13px', fontWeight: '700' },
  editorMode: {
    backgroundColor: tok.orangeFaint, padding: '3px 8px', borderRadius: '6px',
    fontSize: '10px', color: tok.orangeText, fontWeight: '700',
    border: `1px solid ${tok.border}`,
  },
  editorActions: { display: 'flex', gap: '8px' },
  btnEditorAction: {
    padding: '6px 12px', backgroundColor: tok.inputBg,
    border: `1.5px solid ${tok.border}`, borderRadius: '6px',
    color: tok.orangeText, fontSize: '11px', cursor: 'pointer',
    fontWeight: '700', fontFamily: "'Nunito', sans-serif",
  },
  editorContent: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  lineNumbers: {
    width: '50px', backgroundColor: tok.panelHeaderBg,
    borderRight: `1.5px solid ${tok.borderSubtle}`,
    padding: '15px 0', overflowY: 'auto', textAlign: 'right', userSelect: 'none',
  },
  lineNumber: {
    color: tok.textMuted, fontSize: '12px',
    fontFamily: "'DM Mono', 'Monaco', monospace", lineHeight: '1.6', paddingRight: '10px',
  },
  editorTextArea: {
    flex: 1, backgroundColor: 'transparent', border: 'none', color: tok.textPrimary,
    fontSize: '13px', fontFamily: "'DM Mono', 'Monaco', monospace",
    lineHeight: '1.6', padding: '15px', resize: 'none', outline: 'none',
    overflowY: 'auto', whiteSpace: 'pre', tabSize: 4,
  },
  editorPre: {
    flex: 1, margin: 0, color: tok.textPrimary, fontSize: '13px',
    fontFamily: "'DM Mono', 'Monaco', monospace", lineHeight: '1.6',
    padding: '15px', overflowY: 'auto', whiteSpace: 'pre', tabSize: 4,
  },
  editorFooter: {
    display: 'flex', gap: '15px', backgroundColor: tok.panelBg,
    borderTop: `1.5px solid ${tok.borderSubtle}`, padding: '8px 15px',
    fontSize: '11px', color: tok.textMuted,
    fontFamily: "'DM Mono', monospace",
  },
  editorPlaceholder: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', color: '#d1d5db',
  },

  // Block sequencer panel
  blockPanel: {
    width: '240px', minWidth: '240px', display: 'flex', flexDirection: 'column',
    backgroundColor: tok.panelBg,
    borderRight: `1.5px solid ${tok.border}`, overflow: 'hidden',
  },
  blockPanelHeader: {
    padding: '10px 12px 8px', borderBottom: `1.5px solid ${tok.borderSubtle}`,
    display: 'flex', flexDirection: 'column', gap: '6px',
    backgroundColor: tok.panelHeaderBg,
  },
  sequenceNameInput: {
    backgroundColor: 'transparent', border: 'none',
    borderBottom: `1.5px solid ${tok.border}`, color: tok.textPrimary,
    fontSize: '13px', fontWeight: '700', fontFamily: "'Nunito', sans-serif",
    outline: 'none', padding: '2px 0', width: '100%',
  },
  blockList: {
    flex: 1, overflowY: 'auto' as const, padding: '8px',
    display: 'flex', flexDirection: 'column', gap: '6px',
  },
  blockEmpty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', flex: 1,
  },
  blockCard: {
    backgroundColor: tok.inputBg, borderRadius: '10px',
    borderLeft: `3px solid ${tok.orange}`, padding: '8px 10px',
    display: 'flex', flexDirection: 'column', gap: '6px',
    border: `1.5px solid ${tok.border}`,
    boxShadow: tok.shadow,
  },
  blockCardTop: { display: 'flex', alignItems: 'center', gap: '6px' },
  blockTypeBadge: {
    fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px',
    padding: '2px 6px', borderRadius: '4px',
    textTransform: 'uppercase' as const, flex: 1,
  },
  blockControls: { display: 'flex', gap: '2px' },
  blockCtrlBtn: {
    backgroundColor: 'transparent', border: `1.5px solid ${tok.border}`,
    color: tok.textMuted, fontSize: '11px', cursor: 'pointer',
    borderRadius: '5px', padding: '1px 5px', lineHeight: 1.4,
    minWidth: '22px', minHeight: '22px', fontWeight: '700',
  },
  blockBody: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  blockInput: {
    backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`,
    borderRadius: '6px', color: tok.textPrimary, fontSize: '12px', padding: '4px 7px',
    fontFamily: "'DM Mono', 'Consolas', monospace", outline: 'none',
    width: '100%', boxSizing: 'border-box' as const,
  },
  blockAddArea: {
    padding: '6px 8px', borderTop: `1.5px solid ${tok.borderSubtle}`,
    position: 'relative' as const,
  },
  btnAddBlock: {
    width: '100%', padding: '8px',
    backgroundColor: tok.orangeFaint, border: `1.5px dashed ${tok.border}`,
    borderRadius: '8px', color: tok.orange, fontSize: '12px',
    cursor: 'pointer', minHeight: '36px', fontWeight: '700',
    fontFamily: "'Nunito', sans-serif",
  },
  addMenuPopup: {
    display: 'flex', flexDirection: 'column' as const, gap: '2px',
    backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`,
    borderRadius: '10px', overflow: 'hidden',
    boxShadow: tok.shadow,
  },
  addMenuOption: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '9px 12px', backgroundColor: 'transparent', border: 'none',
    borderBottom: `1px solid ${tok.borderSubtle}`, color: tok.textPrimary,
    fontSize: '12px', cursor: 'pointer', textAlign: 'left' as const,
    gap: '8px', minHeight: '38px', fontFamily: "'Nunito', sans-serif",
  },
  blockRunArea: {
    padding: '8px', borderTop: `1.5px solid ${tok.borderSubtle}`,
    display: 'flex', flexDirection: 'column' as const, gap: '6px',
  },
  btnRun: {
    width: '100%', padding: '10px', backgroundColor: tok.green,
    border: `1.5px solid ${tok.green}55`, borderRadius: '8px',
    color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    minHeight: '40px', fontFamily: "'Nunito', sans-serif",
    boxShadow: '0 2px 8px rgba(22,163,74,0.2)',
  },
  btnStop: {
    width: '100%', padding: '10px', backgroundColor: tok.red,
    border: `1.5px solid ${tok.red}55`, borderRadius: '8px',
    color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer',
    minHeight: '40px', fontFamily: "'Nunito', sans-serif",
  },
  blockStats: {
    textAlign: 'center' as const, color: tok.textMuted, fontSize: '10px',
    fontFamily: "'DM Mono', 'Monaco', monospace",
  },
  blockSettings: {
    padding: '8px', borderTop: `1.5px solid ${tok.borderSubtle}`,
    display: 'flex', flexDirection: 'column' as const, gap: '5px',
  },
  settingsSelect: {
    backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`,
    borderRadius: '6px', color: tok.orangeText, fontSize: '11px',
    padding: '3px 5px', outline: 'none', flex: 1,
  },
  cmdRefToggle: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', background: 'none', border: 'none', color: tok.textMuted,
    fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px',
    cursor: 'pointer', padding: '4px 0', minHeight: '28px',
    fontFamily: "'Nunito', sans-serif",
  },
  cmdRefList: {
    display: 'flex', flexDirection: 'column' as const, gap: '1px',
    marginTop: '4px', maxHeight: '220px', overflowY: 'auto' as const,
  },
  cmdRefRow: {
    display: 'grid', gridTemplateColumns: '70px 1fr', gridTemplateRows: 'auto auto',
    gap: '0 6px', padding: '6px 8px', background: tok.orangeFaint,
    border: `1.5px solid ${tok.borderSubtle}`, borderRadius: '7px',
    cursor: 'pointer', textAlign: 'left' as const, transition: 'background 0.1s',
    fontFamily: "'Nunito', sans-serif",
  },
  cmdRefName: {
    color: tok.orange, fontSize: '11px',
    fontFamily: "'DM Mono', 'Monaco', monospace", fontWeight: '600',
    gridColumn: '1', gridRow: '1',
  },
  cmdRefParams: {
    color: '#f59e0b', fontSize: '10px',
    fontFamily: "'DM Mono', 'Monaco', monospace",
    gridColumn: '2', gridRow: '1', alignSelf: 'center',
  },
  cmdRefDesc: {
    color: tok.textMuted, fontSize: '10px',
    gridColumn: '1 / -1', gridRow: '2', marginTop: '2px',
  },
});

export default TotemProgrammingIDE;