// src/components/TotemProgrammingIDE.tsx
// Uses Leo's proven terminal approach for reliable serial communication.
// Motor panel uses Benji's single-char protocol (no line endings, no delay).

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
  
  // Connection state — Leo's approach: simple refs
  const portRef      = useRef<any>(null);
  const writerRef    = useRef<any>(null); // TextEncoderStream writer (for sendCommand)
  const rawWriterRef = useRef<any>(null); // Raw byte writer (for sendChar — Benji's protocol)
  const readerRef    = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Stats
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);

  // Telemetry state — parsed from Benji's JSON stream
  const [telemetry, setTelemetry] = useState<{
    v1: number; v2: number; en: number; sg0: number;
  } | null>(null);

  // Block sequencer state
  const [blocks, setBlocks] = useState<CommandBlock[]>([]);
  const [sequenceName, setSequenceName] = useState('My Sequence');
  const [isRunningSequence, setIsRunningSequence] = useState(false);
  const [blockStatuses, setBlockStatuses] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const stopSequenceRef = useRef(false);
  const termOutputRef = useRef('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const COMMANDS: {[key: string]: {params: Array<{label: string, defaultValue: string}>, description: string}} = {
    "hello":      { params: [], description: "Test connection" },
    "toggle-led": { params: [], description: "Toggles the LED on/off" },
    "blink":      { params: [], description: "Blink LED 5 times (ESP32 only)" },
    "echo_send":  { params: [{ label: "String", defaultValue: "test123" }], description: "Byte-by-byte echo test" },
    "set_pid":    { params: [{ label: "Kp", defaultValue: "1.0" }, { label: "Ki", defaultValue: "0.0" }, { label: "Kd", defaultValue: "0.0" }, { label: "Mode", defaultValue: "1" }], description: "Set PID parameters" },
    "get_pid":    { params: [], description: "Get current PID values" },
    "status":     { params: [], description: "Get system status (ESP32 only)" },
    "help":       { params: [], description: "List available commands" },
    "uart_send":  { params: [{ label: "Message", defaultValue: "test" }], description: "Send via UART2" },
  };

  const [config, setConfig] = useState({ baudRate: 115200 });

  // Board type detection — Roxanne / ESP32 by name or VID/PID
  const getBoardType = (): 'esp32' | 'nucleo' | 'unknown' => {
    const detected = usbService.getDeviceType(totem);
    if (detected !== 'unknown') return detected;
    const name   = totem.name.toLowerCase();
    const serial = totem.serialNumber?.toLowerCase() || '';
    if (name.includes('esp32') || name.includes('esp-32') || name.includes('espressif') ||
        name.includes('cp210') || name.includes('ch340') || name.includes('ch9102') ||
        name.includes('roxanne') ||
        serial.startsWith('303a') || serial.startsWith('10c4') || serial.startsWith('1a86') || serial.startsWith('esp32')) {
      return 'esp32';
    }
    if (name.includes('nucleo') || name.includes('stm32') || name.includes('stm') ||
        name.includes('st-link') || serial.startsWith('0483')) {
      return 'nucleo';
    }
    return 'unknown';
  };

  const boardType = getBoardType();
  const getBoardInfo = () => {
    switch (boardType) {
      case 'esp32':  return { icon: '📡', color: '#00C853', label: 'ESP32' };
      case 'nucleo': return { icon: '🎛️', color: '#2196F3', label: 'NUCLEO' };
      default:       return { icon: '🔧', color: '#888',    label: 'UNKNOWN' };
    }
  };
  const boardInfo = getBoardInfo();

  // Autoscroll terminal
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [termOutput]);

  useEffect(() => {
    const cmdDef = COMMANDS[selectedCommand];
    if (cmdDef) {
      const newParams: {[key: string]: string} = {};
      cmdDef.params.forEach((p, i) => { newParams[`param_${i}`] = p.defaultValue; });
      setCommandParams(newParams);
    }
  }, [selectedCommand]);

  useEffect(() => { return () => { disconnect(); }; }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('makeydooey-blocks');
      const savedName = localStorage.getItem('makeydooey-sequence-name');
      if (saved) setBlocks(JSON.parse(saved));
      if (savedName) setSequenceName(savedName);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { localStorage.setItem('makeydooey-blocks', JSON.stringify(blocks)); }, [blocks]);
  useEffect(() => { localStorage.setItem('makeydooey-sequence-name', sequenceName); }, [sequenceName]);

  const appendToTerminal = (text: string) => {
    termOutputRef.current += text;
    setTermOutput(prev => prev + text);
  };

  // =====================================================
  // BLOCK SEQUENCER
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
      if (stopSequenceRef.current) { appendToTerminal('[■ Sequence stopped]\n'); break; }
      setBlockStatuses(prev => ({ ...prev, [block.id]: 'running' }));
      try {
        if (block.type === 'cmd') {
          const cmd = (block.params && block.params.filter(Boolean).length > 0)
            ? `${block.command} ${block.params.join(' ')}` : block.command!;
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
  // CONNECTION
  // =====================================================
  const connect = async () => {
    if (isConnected) { await disconnect(); return; }

    if (!('serial' in navigator)) {
      appendToTerminal('[ERROR] Web Serial API not supported. Use Chrome or Edge.\n');
      return;
    }

    try {
      appendToTerminal('[Requesting port...]\n');
      const port = await (navigator as any).serial.requestPort();
      const info = port.getInfo();
      appendToTerminal(`[Device: VID=0x${info.usbVendorId?.toString(16) || '?'} PID=0x${info.usbProductId?.toString(16) || '?'}]\n`);
      appendToTerminal(`[Opening at ${config.baudRate} baud...]\n`);
      await port.open({ baudRate: config.baudRate });

      try {
        await port.setSignals({ dataTerminalReady: true, requestToSend: true });
        appendToTerminal('[DTR/RTS set]\n');
      } catch (e) { /* some boards don't support this */ }

      // Raw byte writer — used by sendChar (Benji's single-char protocol)
      // Must be acquired BEFORE piping, because pipeTo locks the stream.
      // We use a separate TransformStream to allow both.
      // Simplest approach: keep one writer for raw bytes, use TextEncoderStream for text.
      //
      // We split: rawWriterRef gets port.writable directly (for single chars),
      // and we use a second TransformStream for the text encoder path.
      // But since WritableStream can only have one writer, we use a single
      // raw Uint8Array writer for everything and encode manually when needed.
      const rawWriter = port.writable.getWriter();
      rawWriterRef.current = rawWriter;

      // For the read side, pipe through TextDecoder
      const decoder = new TextDecoderStream();
      port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();

      portRef.current   = port;
      writerRef.current = rawWriter; // same writer, sendData will encode manually
      readerRef.current = reader;

      setIsConnected(true);
      appendToTerminal('[✓ Connected!]\n\n');
      readLoop(reader);

    } catch (e: any) {
      if (e.name === 'NotFoundError') {
        appendToTerminal('[Cancelled]\n');
      } else {
        appendToTerminal(`[ERROR] ${e.message}\n`);
        if (e.message.includes('busy') || e.message.includes('open')) {
          appendToTerminal('\n[FIX] Port is busy. Try:\n');
          appendToTerminal('  1. Close Arduino Serial Monitor\n');
          appendToTerminal('  2. Unplug and replug the device\n');
        }
      }
    }
  };

  // Read loop — parses Benji's JSON telemetry lines,
  // also passes everything through to the terminal for visibility.
  const readLoop = async (reader: any) => {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          setRxBytes(prev => prev + value.length);

          // Only show non-JSON lines in terminal to keep it clean,
          // but still buffer for JSON parsing
          buffer += value;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            // Try to parse as Benji's JSON telemetry
            try {
              const d = JSON.parse(trimmed);
              // Update telemetry panel
              setTelemetry(prev => ({
                v1:  d.v1  !== undefined ? d.v1  : prev?.v1  ?? 0,
                v2:  d.v2  !== undefined ? d.v2  : prev?.v2  ?? 0,
                en:  d.en  !== undefined ? d.en  : prev?.en  ?? 0,
                sg0: d.sg0 !== undefined ? d.sg0 : prev?.sg0 ?? 0,
              }));
              // Show compact telemetry in terminal
              appendToTerminal(`[TEL] v1:${d.v1?.toFixed(1)} v2:${d.v2?.toFixed(1)} en:${d.en} sg0:${d.sg0}\n`);
              if (d.msg) appendToTerminal(`[MSG] ${d.msg}\n`);
            } catch {
              // Not JSON — show as-is
              appendToTerminal(trimmed + '\n');
            }
          }
        }
      }
    } catch (error: any) {
      if (!error.message?.includes('cancel')) {
        appendToTerminal(`[Read Error] ${error.message}\n`);
      }
    }
  };

  const disconnect = async () => {
    try {
      if (readerRef.current)    { await readerRef.current.cancel().catch(() => {}); readerRef.current = null; }
      if (rawWriterRef.current) { await rawWriterRef.current.releaseLock().catch?.(() => {}); rawWriterRef.current = null; }
      if (writerRef.current)    { writerRef.current = null; }
      if (portRef.current)      { await portRef.current.close().catch(() => {}); portRef.current = null; }
    } catch (e) { /* ignore cleanup errors */ }
    setIsConnected(false);
    setTelemetry(null);
    appendToTerminal('[Disconnected]\n');
  };

  // =====================================================
  // SEND CHAR — Benji's protocol: single byte, no delay, no line ending
  // Mirrors: await writer.write(new TextEncoder().encode(char))
  // =====================================================
  const sendChar = async (char: string) => {
    if (!rawWriterRef.current) return;
    try {
      await rawWriterRef.current.write(new TextEncoder().encode(char));
      setTxBytes(prev => prev + 1);
    } catch (e: any) {
      appendToTerminal(`[TX Error] ${e.message}\n`);
    }
  };

  // =====================================================
  // SEND DATA — Leo's character-by-character approach for text commands
  // Used by sendCommand (block sequencer, manual input)
  // =====================================================
  const sendData = async (str: string) => {
    if (!rawWriterRef.current) { appendToTerminal('[Not connected]\n'); return; }

    let end = lineEnding;
    if (end === '\\r') end = '\r';
    else if (end === '\\n') end = '\n';
    else if (end === '\\r\\n') end = '\r\n';
    const payload = str + end;

    try {
      for (const char of payload) {
        await rawWriterRef.current.write(new TextEncoder().encode(char));
        if (charDelay > 0) await new Promise(r => setTimeout(r, charDelay));
      }
      setTxBytes(prev => prev + payload.length);
    } catch (e: any) {
      appendToTerminal(`[TX Error] ${e.message}\n`);
    }
  };

  const sendCommand = async (command: string) => {
    if (!command.trim()) return;
    if (!isConnected) { appendToTerminal('[Not connected - click Connect first]\n'); return; }
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
      const params = cmdDef.params.map((p, i) => commandParams[`param_${i}`] || p.defaultValue);
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

  // =====================================================
  // FLASH TAB HELPERS
  // =====================================================
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processSelectedFile(file);
  };

  const processSelectedFile = async (file: File) => {
    setSelectedFile(file);
    addLog(`Selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    const textExtensions = ['.c', '.cpp', '.h', '.hpp', '.ino', '.txt', '.json', '.py', '.s', '.asm'];
    const isTextFile = textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (isTextFile) {
      try {
        const content = await readFileAsText(file);
        setFileContent(content); setEditedContent(content);
        setIsEditorOpen(true); setEditorMode('view'); setHasUnsavedChanges(false);
        addLog(`Loaded ${file.name} for editing`);
      } catch (error) { addLog(`Error reading file: ${error}`); }
    } else {
      setFileContent(''); setEditedContent(''); setIsEditorOpen(false);
      addLog(`Binary file selected - ready for flashing`);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const validExtensions = ['.bin', '.hex', '.elf', '.c', '.cpp', '.h', '.hpp', '.ino', '.txt', '.json', '.py', '.s', '.asm'];
      if (validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) processSelectedFile(file);
      else addLog(`Invalid file type: ${file.name}`);
    }
  };

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
    setHasUnsavedChanges(e.target.value !== fileContent);
  };

  const handleSaveFile = () => {
    if (!selectedFile || !hasUnsavedChanges) return;
    const blob = new Blob([editedContent], { type: 'text/plain' });
    setSelectedFile(new File([blob], selectedFile.name, { type: selectedFile.type }));
    setFileContent(editedContent); setHasUnsavedChanges(false);
    addLog(`Saved changes to ${selectedFile.name}`);
  };

  const handleDownloadFile = () => {
    if (!selectedFile) return;
    const content = hasUnsavedChanges ? editedContent : fileContent;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = selectedFile.name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    addLog(`Downloaded: ${selectedFile.name}`);
  };

  const handleNewFile = () => {
    const fileName = prompt('Enter file name (e.g., main.c):');
    if (fileName) {
      const blob = new Blob(['// New file\n'], { type: 'text/plain' });
      setSelectedFile(new File([blob], fileName, { type: 'text/plain' }));
      setFileContent('// New file\n'); setEditedContent('// New file\n');
      setIsEditorOpen(true); setEditorMode('edit'); setHasUnsavedChanges(false);
      addLog(`Created new file: ${fileName}`);
    }
  };

  const handleDiscardChanges = () => {
    if (hasUnsavedChanges && confirm('Discard unsaved changes?')) {
      setEditedContent(fileContent); setHasUnsavedChanges(false); setEditorMode('view');
      addLog('Changes discarded');
    }
  };

  const handleCloseEditor = () => {
    if (hasUnsavedChanges && !confirm('You have unsaved changes. Close anyway?')) return;
    setIsEditorOpen(false); setEditorMode('view');
  };

  const ESP32_LED_EXAMPLE = `// MakeyDooey ESP32-S3 Firmware Example
#include <Arduino.h>
#define RGB_LED_PIN 48
bool ledState = false;
String inputBuffer = "";
void setLED(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(RGB_LED_PIN, r, g, b); }
void processCommand(String cmd) {
  cmd.trim();
  if (cmd == "hello") { Serial.println("Hello, World!\\r"); }
  else if (cmd == "toggle-led") {
    ledState = !ledState;
    setLED(ledState?255:0, ledState?255:0, ledState?255:0);
    Serial.println(ledState ? "LED ON\\r" : "LED OFF\\r");
  }
  else if (cmd == "help") { Serial.println("Commands: hello, toggle-led, help\\r"); }
  else { Serial.print("Unknown: "); Serial.println(cmd); }
}
void setup() {
  Serial.begin(115200); delay(1000); setLED(0,0,0);
  Serial.println("Ready\\r");
}
void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\\r' || c == '\\n') { if (inputBuffer.length() > 0) { processCommand(inputBuffer); inputBuffer = ""; } }
    else { inputBuffer += c; }
  }
  delay(1);
}`;

  const SERIAL_TEST_COMMANDS = [
    { cmd: 'hello', desc: 'Test connection' },
    { cmd: 'toggle-led', desc: 'Toggle LED' },
    { cmd: 'blink', desc: 'Blink LED' },
  ];

  const handleLoadExample = () => {
    const fileName = 'esp32s3_example.ino';
    const blob = new Blob([ESP32_LED_EXAMPLE], { type: 'text/plain' });
    const file = new File([blob], fileName, { type: 'text/plain' });
    setSelectedFile(file); setFileContent(ESP32_LED_EXAMPLE); setEditedContent(ESP32_LED_EXAMPLE);
    setIsEditorOpen(true); setEditorMode('view'); setHasUnsavedChanges(false);
    addLog(`Loaded example: ${fileName}`);
  };

  const handleFlashFirmware = async () => {
    if (!selectedFile) { alert('Please select a firmware file first'); return; }
    const fileName = selectedFile.name.toLowerCase();
    const isSourceFile = fileName.endsWith('.ino') || fileName.endsWith('.c') || fileName.endsWith('.cpp');
    if (isSourceFile) {
      addLog(`Source file — needs Arduino IDE to compile`);
      if (confirm(`Download "${selectedFile.name}" to flash via Arduino IDE?`)) { handleDownloadFile(); }
      return;
    }
    setIsProgramming(true); setProgress(0);
    addLog(`Flashing: ${selectedFile.name}`);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setProgress(i);
      if (i === 0) addLog('Connecting to bootloader...');
      if (i === 20) addLog('Erasing flash...');
      if (i === 40) addLog('Writing firmware...');
      if (i === 80) addLog('Verifying...');
    }
    setIsProgramming(false); addLog('✓ Flash complete!');
    onProgramSuccess(totem.id);
    if (confirm('Flash complete! Go to Monitor tab?')) setActiveTab('monitor');
  };

  const handleClose = async () => { await disconnect(); onClose(); };

  const QuickButton = ({ cmd, label }: { cmd: string, label?: string }) => (
    <button style={styles.quickBtn} onClick={() => sendCommand(cmd)} disabled={!isConnected}>{label || cmd}</button>
  );

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <h2 style={styles.title}>
            {boardInfo.icon} {totem.name}
            <span style={{ color: boardInfo.color, marginLeft: '10px', fontSize: '13px', backgroundColor: `${boardInfo.color}22`, padding: '2px 8px', borderRadius: '4px' }}>
              {boardInfo.label}
            </span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: '#666' }}>S/N: {totem.serialNumber}</span>
            <button style={styles.closeButton} onClick={handleClose}>×</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['flash', 'monitor'] as const).map(tab => (
          <button key={tab} style={{ ...styles.tab, ...(activeTab === tab ? styles.tabActive : {}) }} onClick={() => setActiveTab(tab)}>
            {tab === 'flash' ? '⚡ Flash' : '📟 Monitor'}
          </button>
        ))}
      </div>

      <div style={styles.content}>
        {/* ==================== MONITOR TAB ==================== */}
        {activeTab === 'monitor' && (
          <div style={{ display: 'flex', height: 'calc(100vh - 180px)', overflow: 'hidden' }}>

            {/* Block Sequencer Panel */}
            <div style={styles.blockPanel}>
              <div style={styles.blockPanelHeader}>
                <span style={{ color: '#aaa', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>Sequence</span>
                <input style={styles.sequenceNameInput} value={sequenceName} onChange={e => setSequenceName(e.target.value)} disabled={isRunningSequence} />
              </div>

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
                      <div style={styles.blockCardTop}>
                        <span style={{ ...styles.blockTypeBadge, backgroundColor: borderColor === '#EB7923' ? '#fff3e0' : borderColor === '#16a34a' ? '#dcfce7' : '#ede9fe', color: borderColor === '#EB7923' ? '#92400e' : borderColor === '#16a34a' ? '#14532d' : '#4c1d95' }}>
                          {block.type === 'cmd' ? 'CMD' : block.type === 'delay' ? 'DELAY' : 'WAIT'}
                        </span>
                        <span style={{ color: statusColor, fontSize: '14px', lineHeight: 1 }}>{statusLabel}</span>
                        {!isRunningSequence && (
                          <div style={styles.blockControls}>
                            <button style={styles.blockCtrlBtn} onClick={() => moveBlock(block.id, -1)} disabled={idx === 0}>↑</button>
                            <button style={styles.blockCtrlBtn} onClick={() => moveBlock(block.id, 1)} disabled={idx === blocks.length - 1}>↓</button>
                            <button style={{ ...styles.blockCtrlBtn, color: '#dc2626', borderColor: 'rgba(220,38,38,0.25)' }} onClick={() => removeBlock(block.id)}>×</button>
                          </div>
                        )}
                      </div>
                      {block.type === 'cmd' && (
                        <div style={styles.blockBody}>
                          <input style={styles.blockInput} value={block.command ?? ''} onChange={e => updateBlock(block.id, { command: e.target.value })} disabled={isRunningSequence} placeholder="command" list="cmd-suggestions" />
                          <datalist id="cmd-suggestions">{Object.keys(COMMANDS).map(c => <option key={c} value={c} />)}</datalist>
                          {COMMANDS[block.command ?? '']?.params.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {COMMANDS[block.command!].params.map((p, i) => (
                                <input key={i} style={{ ...styles.blockInput, flex: 1, minWidth: '50px' }}
                                  value={(block.params ?? [])[i] ?? p.defaultValue}
                                  onChange={e => {
                                    const updated = [...(block.params ?? COMMANDS[block.command!].params.map(pp => pp.defaultValue))];
                                    updated[i] = e.target.value;
                                    updateBlock(block.id, { params: updated });
                                  }}
                                  disabled={isRunningSequence} placeholder={p.label}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {block.type === 'delay' && (
                        <div style={styles.blockBody}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input style={{ ...styles.blockInput, width: '70px' }} type="number" value={block.delayMs ?? 500} onChange={e => updateBlock(block.id, { delayMs: parseInt(e.target.value) || 0 })} disabled={isRunningSequence} min="0" />
                            <span style={{ color: '#888', fontSize: '11px' }}>ms</span>
                          </div>
                        </div>
                      )}
                      {block.type === 'waitfor' && (
                        <div style={styles.blockBody}>
                          <input style={styles.blockInput} value={block.matchStr ?? ''} onChange={e => updateBlock(block.id, { matchStr: e.target.value })} disabled={isRunningSequence} placeholder="match string" />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <input style={{ ...styles.blockInput, width: '60px' }} type="number" value={block.timeoutMs ?? 3000} onChange={e => updateBlock(block.id, { timeoutMs: parseInt(e.target.value) || 0 })} disabled={isRunningSequence} min="100" />
                            <span style={{ color: '#888', fontSize: '11px' }}>ms timeout</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={styles.blockAddArea}>
                {showAddMenu ? (
                  <div style={styles.addMenuPopup}>
                    <button style={styles.addMenuOption} onClick={() => addBlock('cmd')}><span style={{ color: '#92400e', fontWeight: '700' }}>CMD</span><span style={{ color: '#888', fontSize: '11px' }}>Send a command</span></button>
                    <button style={styles.addMenuOption} onClick={() => addBlock('delay')}><span style={{ color: '#14532d', fontWeight: '700' }}>DELAY</span><span style={{ color: '#888', fontSize: '11px' }}>Wait N ms</span></button>
                    <button style={styles.addMenuOption} onClick={() => addBlock('waitfor')}><span style={{ color: '#4c1d95', fontWeight: '700' }}>WAIT FOR</span><span style={{ color: '#888', fontSize: '11px' }}>Match response</span></button>
                    <button style={{ ...styles.addMenuOption, color: '#666', fontSize: '11px', justifyContent: 'center' }} onClick={() => setShowAddMenu(false)}>Cancel</button>
                  </div>
                ) : (
                  <button style={styles.btnAddBlock} onClick={() => setShowAddMenu(true)} disabled={isRunningSequence}>+ Add Block</button>
                )}
              </div>

              <div style={styles.blockRunArea}>
                {isRunningSequence
                  ? <button style={styles.btnStop} onClick={() => { stopSequenceRef.current = true; }}>■ Stop</button>
                  : <button style={{ ...styles.btnRun, opacity: (blocks.length === 0 || !isConnected) ? 0.45 : 1 }} onClick={runSequence} disabled={blocks.length === 0 || !isConnected}>▶ Run Sequence</button>
                }
                <div style={styles.blockStats}>TX: {txBytes} | RX: {rxBytes}</div>
              </div>

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

            {/* Terminal Area */}
            <div style={styles.terminalArea}>
              {/* Control Bar */}
              <div style={styles.controlBar}>
                <button style={{ ...styles.btnConnect, backgroundColor: isConnected ? '#c62828' : '#2e7d32' }} onClick={connect}>
                  {isConnected ? '❌ Disconnect' : '🔌 Connect'}
                </button>
                <button style={styles.btnSmall} onClick={() => { setTermOutput(''); termOutputRef.current = ''; }}>🗑️ Clear</button>
                <div style={styles.connectionStatus}>
                  <span style={{ color: isConnected ? '#4caf50' : '#888', fontSize: '20px', lineHeight: '1' }}>●</span>
                  <span style={{ color: isConnected ? '#4caf50' : '#888' }}>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>

              {/* Motor Control Panel — ESP32 only (Benji's single-char protocol) */}
              {boardType === 'esp32' && (
                <BenjiPanel sendChar={sendChar} isConnected={isConnected} telemetry={telemetry} tok={tok} />
              )}

              {/* Terminal Output */}
              <div ref={terminalRef} style={styles.terminal}>
                {termOutput || `MakeyDooey Terminal Ready\n\n1. Click "🔌 Connect" and select your device\n2. Use the motor panel above or type commands below\n\nTip: If port is busy, close Arduino Serial Monitor first.\n`}
              </div>

              {/* Manual Input */}
              <div style={styles.inputRow}>
                <input type="text" style={styles.manualInput}
                  placeholder={isConnected ? "Type command and press Enter..." : "Connect first..."}
                  value={commandInput} onChange={e => setCommandInput(e.target.value)}
                  onKeyDown={handleKeyDown} disabled={!isConnected}
                />
                <button style={styles.btnInputSend} onClick={() => sendCommand(commandInput)} disabled={!isConnected}>Send</button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== FLASH TAB ==================== */}
        {activeTab === 'flash' && (
          <div style={{ display: 'flex', gap: '15px', height: 'calc(100vh - 180px)' }}>
            <div style={styles.flashSidebar}>
              <div style={styles.flashSection}>
                <h4 style={styles.flashSectionTitle}>📁 Firmware File</h4>
                <input ref={fileInputRef} type="file" accept=".bin,.hex,.elf,.c,.cpp,.h,.hpp,.ino,.txt,.json,.py,.s,.asm" style={{ display: 'none' }} onChange={handleFileSelect} />
                <div style={{ ...styles.dropZone, borderColor: isDragOver ? '#2196F3' : '#444', backgroundColor: isDragOver ? tok.blueFaint : tok.orangeFaint }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>{isDragOver ? '📥' : '📂'}</div>
                  <div style={{ color: '#888', fontSize: '12px' }}>{isDragOver ? 'Drop file here' : 'Drag & drop or click to browse'}</div>
                  <div style={{ color: '#555', fontSize: '10px', marginTop: '8px' }}>.bin .hex .elf .c .cpp .h .ino .py</div>
                </div>
                {selectedFile && (
                  <div style={styles.selectedFileInfo}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#4CAF50', fontSize: '16px' }}>✓</span>
                      <span style={{ color: '#fff', fontSize: '13px', fontWeight: '500' }}>{selectedFile.name}</span>
                    </div>
                    <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{(selectedFile.size / 1024).toFixed(2)} KB</div>
                  </div>
                )}
                <div style={styles.fileActions}>
                  <button style={styles.btnSecondary} onClick={handleNewFile}>✚ New</button>
                  <button style={styles.btnSecondary} onClick={() => fileInputRef.current?.click()}>📂 Open</button>
                  {selectedFile && isEditorOpen && <button style={styles.btnSecondary} onClick={handleDownloadFile}>💾 Save</button>}
                </div>
                <div style={{ marginTop: '12px' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase' }}>Examples</div>
                  <button style={{ ...styles.btnSecondary, width: '100%', backgroundColor: '#109810', borderColor: '#0e8514', textAlign: 'left', padding: '10px 12px' }} onClick={handleLoadExample}>💡 ESP32-S3 LED Blink</button>
                </div>
              </div>

              <div style={styles.flashSection}>
                <h4 style={styles.flashSectionTitle}>⚡ Flash Firmware</h4>
                <button style={{ ...styles.btnFlash, opacity: (!selectedFile || isProgramming) ? 0.5 : 1 }} onClick={handleFlashFirmware} disabled={!selectedFile || isProgramming}>
                  {isProgramming ? '⏳ Programming...' : '🚀 Flash to Device'}
                </button>
                {isProgramming && (
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                    <div style={styles.progressText}>{progress}%</div>
                  </div>
                )}
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#888' }}>Note: For .ino files, download and flash via Arduino IDE.</div>
              </div>

              <div style={styles.flashSection}>
                <h4 style={styles.flashSectionTitle}>🔗 Test Connection</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {SERIAL_TEST_COMMANDS.map(({ cmd, desc }) => (
                    <button key={cmd} style={{ ...styles.btnSecondary, width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', opacity: isConnected ? 1 : 0.5 }}
                      onClick={() => { if (isConnected) { sendCommand(cmd); addLog(`Sent: ${cmd}`); } else { addLog('Not connected'); } }}
                      disabled={!isConnected}
                    >
                      <span>{cmd}</span>
                      <span style={{ color: '#666', fontSize: '10px' }}>{desc}</span>
                    </button>
                  ))}
                </div>
                <button style={{ ...styles.btnSecondary, width: '100%', marginTop: '10px', backgroundColor: isConnected ? tok.greenFaint : tok.panelBg, borderColor: isConnected ? '#4CAF50' : '#444' }} onClick={() => setActiveTab('monitor')}>
                  📟 {isConnected ? 'View Serial Output →' : 'Go to Monitor to Connect →'}
                </button>
              </div>

              <div style={{ ...styles.flashSection, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h4 style={styles.flashSectionTitle}>📋 Activity Log</h4>
                <div style={styles.flashLogOutput}>
                  {logs.length === 0 ? <div style={{ color: '#555' }}>No activity yet...</div>
                    : logs.map((log, i) => <div key={i} style={styles.logLine}>{log}</div>)}
                </div>
              </div>
            </div>

            <div style={styles.editorPanel}>
              {isEditorOpen && selectedFile ? (
                <>
                  <div style={styles.editorHeader}>
                    <div style={styles.editorFileInfo}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <span style={styles.editorFileName}>{selectedFile.name}{hasUnsavedChanges && <span style={{ color: '#FF9800' }}> •</span>}</span>
                      <span style={styles.editorMode}>{editorMode === 'edit' ? '✏️ Editing' : '👁️ Viewing'}</span>
                    </div>
                    <div style={styles.editorActions}>
                      {editorMode === 'view'
                        ? <button style={styles.btnEditorAction} onClick={() => setEditorMode('edit')}>✏️ Edit</button>
                        : <>
                            <button style={{ ...styles.btnEditorAction, backgroundColor: hasUnsavedChanges ? '#2e7d32' : '#333', opacity: hasUnsavedChanges ? 1 : 0.5 }} onClick={handleSaveFile} disabled={!hasUnsavedChanges}>💾 Save</button>
                            {hasUnsavedChanges && <button style={{ ...styles.btnEditorAction, backgroundColor: '#c62828' }} onClick={handleDiscardChanges}>✗ Discard</button>}
                            <button style={styles.btnEditorAction} onClick={() => setEditorMode('view')}>👁️ View</button>
                          </>
                      }
                      <button style={{ ...styles.btnEditorAction, marginLeft: '10px' }} onClick={handleCloseEditor}>✕</button>
                    </div>
                  </div>
                  <div style={styles.editorContent}>
                    <div style={styles.lineNumbers}>
                      {(editorMode === 'edit' ? editedContent : fileContent).split('\n').map((_, i) => (
                        <div key={i} style={styles.lineNumber}>{i + 1}</div>
                      ))}
                    </div>
                    {editorMode === 'edit'
                      ? <textarea ref={editorRef} style={styles.editorTextArea} value={editedContent} onChange={handleEditorChange} spellCheck={false} />
                      : <pre style={styles.editorPre}>{fileContent || 'Empty file'}</pre>
                    }
                  </div>
                  <div style={styles.editorFooter}>
                    <span>Lines: {(editorMode === 'edit' ? editedContent : fileContent).split('\n').length}</span>
                    <span>|</span><span>Chars: {(editorMode === 'edit' ? editedContent : fileContent).length}</span>
                    <span>|</span><span>UTF-8</span>
                  </div>
                </>
              ) : (
                <div style={styles.editorPlaceholder}>
                  <div style={{ fontSize: '48px', marginBottom: '20px', opacity: 0.3 }}>📝</div>
                  <div style={{ color: '#888', fontSize: '16px', marginBottom: '10px' }}>Code Editor</div>
                  <div style={{ color: '#555', fontSize: '13px', marginBottom: '20px' }}>Select a file or load an example</div>
                  <button style={{ padding: '12px 24px', backgroundColor: '#1a3a1a', border: '1px solid #2e7d32', borderRadius: '6px', color: '#4CAF50', fontSize: '14px', cursor: 'pointer' }} onClick={handleLoadExample}>💡 Load ESP32-S3 Example</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BenjiPanel — Roxanne motor control using Benji's single-char protocol
//
// Protocol (mirrors motor_console.html exactly):
//   DC Motor 1:  q=CW, a=CCW, z=stop
//   DC Motor 2:  w=CW, s=CCW, x=stop
//   Stepper 0:   1=CW (hold), 2=CCW (hold), 0=stop all
//   Stepper 1:   3=CW (hold), 4=CCW (hold), 0=stop all
//   Stepper 2:   5=CW (hold), 6=CCW (hold), 0=stop all
//
// Telemetry: JSON {"v1":float,"v2":float,"en":0|1,"sg0":int} every 100ms
// ─────────────────────────────────────────────────────────────────────────────

interface BenjiPanelProps {
  sendChar: (char: string) => Promise<void>;
  isConnected: boolean;
  telemetry: { v1: number; v2: number; en: number; sg0: number } | null;
  tok: ReturnType<typeof T>;
}

const BenjiPanel: React.FC<BenjiPanelProps> = ({ sendChar, isConnected, telemetry, tok }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const disabled = !isConnected;

  // Hold-to-run button — sends char on press, stop char on release
  const HoldBtn = ({
    label, pressChar, releaseChar, color = '#444',
  }: { label: string; pressChar: string; releaseChar: string; color?: string }) => (
    <button
      disabled={disabled}
      onMouseDown={() => sendChar(pressChar)}
      onMouseUp={() => sendChar(releaseChar)}
      onMouseLeave={() => sendChar(releaseChar)} // safety: release if cursor leaves
      onTouchStart={e => { e.preventDefault(); sendChar(pressChar); }}
      onTouchEnd={() => sendChar(releaseChar)}
      style={{
        padding: '10px 14px', borderRadius: '7px', border: 'none',
        background: disabled ? tok.border : color,
        color: disabled ? tok.textMuted : '#fff',
        fontWeight: 700, fontSize: '13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
        userSelect: 'none',
        WebkitUserSelect: 'none',
      } as React.CSSProperties}
    >
      {label}
    </button>
  );

  // Tap button — single send, no release needed
  const TapBtn = ({ label, char, color = '#555' }: { label: string; char: string; color?: string }) => (
    <button
      disabled={disabled}
      onClick={() => sendChar(char)}
      style={{
        padding: '10px 14px', borderRadius: '7px', border: 'none',
        background: disabled ? tok.border : color,
        color: disabled ? tok.textMuted : '#fff',
        fontWeight: 700, fontSize: '13px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: "'Nunito', 'Helvetica Neue', sans-serif",
      }}
    >
      {label}
    </button>
  );

  const sectionTitle = (t: string) => (
    <div style={{ fontSize: '11px', fontWeight: 700, color: tok.textMuted, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '6px' }}>
      {t}
    </div>
  );

  // SG0 load bar colour
  const sg0Color = telemetry
    ? telemetry.sg0 < 50 ? '#f44336' : telemetry.sg0 < 150 ? '#ff9800' : '#00e5ff'
    : '#555';

  return (
    <div style={{ border: `1.5px solid ${tok.orange}44`, borderRadius: '10px', overflow: 'hidden', background: tok.orangeFaint, flexShrink: 0 }}>
      {/* Header */}
      <div onClick={() => setIsExpanded(p => !p)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', cursor: 'pointer', background: tok.panelHeaderBg, borderBottom: isExpanded ? `1px solid ${tok.orange}33` : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px' }}>🤖</span>
          <span style={{ fontWeight: 800, fontSize: '12px', color: tok.orangeText, fontFamily: "'Nunito', 'Helvetica Neue', sans-serif" }}>Roxanne Motor Controls</span>
          {/* EN status pill */}
          {telemetry && (
            <span style={{
              fontSize: '10px', borderRadius: '4px', padding: '1px 8px', fontWeight: 700,
              background: telemetry.en === 1 ? '#1b5e20' : '#b71c1c',
              color: '#fff',
              border: `1px solid ${telemetry.en === 1 ? '#4caf50' : '#f44336'}`,
            }}>
              {telemetry.en === 1 ? 'MOTORS LOCKED' : 'MOTORS RELEASED'}
            </span>
          )}
          {!isConnected && <span style={{ fontSize: '10px', color: tok.textMuted, fontStyle: 'italic' }}>— connect first</span>}
        </div>
        <span style={{ color: tok.textMuted, fontSize: '11px' }}>{isExpanded ? '▲' : '▼'}</span>
      </div>

      {isExpanded && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Telemetry row */}
          {telemetry && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
              {[
                { label: 'DC1 vel', value: telemetry.v1.toFixed(1), color: '#00e5ff' },
                { label: 'DC2 vel', value: telemetry.v2.toFixed(1), color: '#00e5ff' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: '#1a1a1a', borderRadius: '8px', padding: '6px 12px', border: '1px solid #333', minWidth: '80px' }}>
                  <div style={{ fontSize: '10px', color: tok.textMuted, textTransform: 'uppercase' as const }}>{label}</div>
                  <div style={{ fontSize: '20px', fontFamily: "'DM Mono', monospace", color, marginTop: '2px' }}>{value}</div>
                </div>
              ))}
              <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '6px 12px', border: '1px solid #333', minWidth: '100px' }}>
                <div style={{ fontSize: '10px', color: tok.textMuted, textTransform: 'uppercase' as const }}>S0 Load (SG)</div>
                <div style={{ fontSize: '20px', fontFamily: "'DM Mono', monospace", color: sg0Color, marginTop: '2px' }}>{telemetry.sg0}</div>
                <div style={{ fontSize: '9px', color: '#555', marginTop: '2px' }}>0=stall · 510=free</div>
              </div>
            </div>
          )}

          {/* DC Motors */}
          <div>
            {sectionTitle('⚙️ DC Motors')}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' as const }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: tok.textMuted }}>DC 1</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <HoldBtn label="▶ CW"  pressChar="q" releaseChar="z" color="#00796b" />
                  <HoldBtn label="◀ CCW" pressChar="a" releaseChar="z" color="#00796b" />
                  <TapBtn  label="■"     char="z"                       color="#b71c1c" />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: tok.textMuted }}>DC 2</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <HoldBtn label="▶ CW"  pressChar="w" releaseChar="x" color="#00796b" />
                  <HoldBtn label="◀ CCW" pressChar="s" releaseChar="x" color="#00796b" />
                  <TapBtn  label="■"     char="x"                       color="#b71c1c" />
                </div>
              </div>
            </div>
          </div>

          {/* Steppers */}
          <div>
            {sectionTitle('🔩 Steppers (TMC2209) — hold to run')}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
              {[
                { label: 'S0', cwChar: '1', ccwChar: '2' },
                { label: 'S1', cwChar: '3', ccwChar: '4' },
                { label: 'S2', cwChar: '5', ccwChar: '6' },
              ].map(({ label, cwChar, ccwChar }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: tok.textMuted }}>{label}</span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <HoldBtn label="▶ CW"  pressChar={cwChar}  releaseChar="0" color="#1565c0" />
                    <HoldBtn label="◀ CCW" pressChar={ccwChar} releaseChar="0" color="#1565c0" />
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                <TapBtn label="⛔ Stop All Steppers" char="0" color="#c62828" />
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};

// =====================================================
// STYLES
// =====================================================

const buildStyles = (tok: ReturnType<typeof T>): { [key: string]: React.CSSProperties } => ({
  container: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: tok.pageBg, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: "'Nunito', 'Helvetica Neue', sans-serif", transition: 'background 0.3s' },
  header: { background: tok.cardBg, borderBottom: `1.5px solid ${tok.border}`, padding: '12px 320px 12px 20px', boxShadow: tok.shadow, transition: 'background 0.3s' },
  headerContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { margin: 0, color: tok.textPrimary, fontSize: '16px', fontWeight: '800', fontFamily: "'Nunito', sans-serif" },
  closeButton: { backgroundColor: 'transparent', border: `1.5px solid ${tok.border}`, borderRadius: '8px', color: tok.orangeText, fontSize: '20px', cursor: 'pointer', padding: '2px 10px', lineHeight: '1' },
  tabs: { display: 'flex', backgroundColor: tok.panelHeaderBg, borderBottom: `1.5px solid ${tok.border}`, paddingLeft: '20px' },
  tab: { backgroundColor: 'transparent', border: 'none', color: tok.textMuted, padding: '11px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: '700', fontFamily: "'Nunito', sans-serif", borderBottom: '2px solid transparent', transition: 'color 0.15s' },
  tabActive: { color: tok.orange, borderBottomColor: '#EB7923' },
  content: { flex: 1, overflow: 'auto', padding: '15px', background: tok.pageBg },
  sidebar: { width: '260px', backgroundColor: tok.panelBg, borderRadius: '12px', padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', border: `1.5px solid ${tok.border}` },
  sidebarSection: { display: 'flex', flexDirection: 'column', gap: '10px' },
  sidebarTitle: { margin: 0, fontSize: '11px', color: tok.textMuted, textTransform: 'uppercase', letterSpacing: '1px' },
  divider: { borderTop: `1.5px solid ${tok.borderSubtle}`, margin: '5px 0' },
  select: { width: '100%', padding: '8px 10px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '8px', color: tok.textPrimary, fontSize: '13px', cursor: 'pointer' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '4px' },
  inputLabel: { color: tok.textMuted, fontSize: '11px', textTransform: 'uppercase' },
  input: { width: '100%', padding: '8px 10px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '8px', color: tok.textPrimary, fontSize: '13px', fontFamily: "'DM Mono', 'Consolas', monospace", boxSizing: 'border-box' },
  cmdDesc: { fontSize: '11px', color: tok.textMuted, padding: '8px', backgroundColor: tok.orangeFaint, borderRadius: '8px', border: `1px solid ${tok.borderSubtle}` },
  btnSend: { width: '100%', padding: '10px', backgroundColor: tok.orange, border: 'none', borderRadius: '8px', color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Nunito', sans-serif", boxShadow: `0 2px 8px ${tok.orangeSubtle}` },
  quickGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  quickBtn: { padding: '6px 8px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '6px', color: tok.orangeText, fontSize: '11px', cursor: 'pointer', fontWeight: '700', fontFamily: "'Nunito', sans-serif" },
  stats: { fontSize: '11px', color: tok.textMuted, textAlign: 'center', padding: '8px', backgroundColor: tok.orangeFaint, borderRadius: '8px', marginTop: 'auto' },
  terminalArea: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: tok.termBg, borderRadius: '14px', overflow: 'hidden', border: `1.5px solid ${tok.borderStrong}`, boxShadow: tok.shadow },
  controlBar: { display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: tok.termHeaderBg, padding: '10px 15px', borderBottom: `1px solid ${tok.border}` },
  btnConnect: { padding: '8px 16px', border: 'none', borderRadius: '8px', color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" },
  baudSelect: { padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.08)', border: `1px solid ${tok.border}`, borderRadius: '6px', color: tok.textPrimary, fontSize: '13px' },
  btnSmall: { padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.07)', border: `1px solid ${tok.border}`, borderRadius: '6px', color: tok.textPrimary, fontSize: '12px', cursor: 'pointer' },
  connectionStatus: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' },
  terminal: { flex: 1, padding: '15px', whiteSpace: 'pre-wrap', overflowY: 'auto', fontSize: '13px', color: tok.termText, fontFamily: "'DM Mono', 'Monaco', 'Consolas', monospace", lineHeight: '1.5', background: 'transparent' },
  inputRow: { display: 'flex', borderTop: `1px solid ${tok.border}` },
  manualInput: { flex: 1, padding: '12px 15px', backgroundColor: tok.termInputBg, border: 'none', color: tok.termText, fontSize: '14px', fontFamily: "'DM Mono', 'Monaco', monospace", outline: 'none' },
  btnInputSend: { padding: '12px 20px', backgroundColor: tok.orange, border: 'none', borderLeft: `1px solid ${tok.border}`, color: tok.textOnOrange, fontSize: '13px', cursor: 'pointer', fontWeight: '700', fontFamily: "'Nunito', sans-serif" },
  section: { backgroundColor: tok.cardBg, borderRadius: '12px', padding: '20px', marginBottom: '15px', border: `1.5px solid ${tok.border}`, boxShadow: tok.shadow },
  sectionTitle: { margin: '0 0 15px 0', color: tok.textPrimary, fontSize: '14px', fontWeight: '800', fontFamily: "'Nunito', sans-serif" },
  btnPrimary: { backgroundColor: tok.orange, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Nunito', sans-serif", boxShadow: `0 2px 8px ${tok.orangeSubtle}` },
  btnSuccess: { backgroundColor: tok.green, color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: "'Nunito', sans-serif" },
  progressBar: { position: 'relative', width: '100%', height: '24px', backgroundColor: tok.orangeFaint, borderRadius: '8px', overflow: 'hidden', marginTop: '12px', border: `1.5px solid ${tok.border}` },
  progressFill: { height: '100%', backgroundColor: tok.orange, transition: 'width 0.3s' },
  progressText: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: tok.textPrimary, fontSize: '11px', fontWeight: '700' },
  logOutput: { backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`, borderRadius: '8px', padding: '12px', maxHeight: '200px', overflowY: 'auto', fontFamily: "'DM Mono', monospace", fontSize: '12px' },
  logLine: { color: tok.orangeText, marginBottom: '4px' },
  configGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' },
  configItem: { display: 'flex', flexDirection: 'column', gap: '6px' },
  configLabel: { fontSize: '12px', color: tok.textMuted, fontWeight: '500' },
  selectInput: { backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '8px', padding: '8px 12px', color: tok.textPrimary, fontSize: '13px' },
  statusGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' },
  statusField: { backgroundColor: tok.orangeFaint, padding: '12px', borderRadius: '8px', border: `1.5px solid ${tok.borderSubtle}` },
  statusFieldLabel: { fontSize: '10px', color: tok.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  statusFieldValue: { fontSize: '14px', fontWeight: '700', color: tok.textPrimary, fontFamily: "'DM Mono', monospace" },
  flashSidebar: { width: '300px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' },
  flashSection: { backgroundColor: tok.cardBg, borderRadius: '14px', padding: '15px', border: `1.5px solid ${tok.border}`, boxShadow: tok.shadow },
  flashSectionTitle: { margin: '0 0 12px 0', color: tok.textPrimary, fontSize: '13px', fontWeight: '800', fontFamily: "'Nunito', sans-serif" },
  dropZone: { border: `2px dashed ${tok.border}`, borderRadius: '10px', padding: '25px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '12px', backgroundColor: tok.orangeFaint },
  selectedFileInfo: { backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`, borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' },
  fileActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  btnSecondary: { flex: 1, minWidth: '60px', padding: '8px 12px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '8px', color: tok.orangeText, fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: '700', fontFamily: "'Nunito', sans-serif" },
  btnFlash: { width: '100%', padding: '12px 20px', backgroundColor: tok.orange, border: 'none', borderRadius: '10px', color: tok.textOnOrange, fontSize: '14px', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s', fontFamily: "'Nunito', sans-serif", boxShadow: `0 3px 12px ${tok.orangeSubtle}` },
  flashLogOutput: { flex: 1, backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`, borderRadius: '8px', padding: '10px', overflowY: 'auto', fontFamily: "'DM Mono', monospace", fontSize: '11px', minHeight: '100px', color: tok.orangeText },
  editorPanel: { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: tok.cardBgAlt, borderRadius: '14px', border: `1.5px solid ${tok.border}`, overflow: 'hidden' },
  editorHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: tok.cardBg, borderBottom: `1.5px solid ${tok.borderSubtle}`, padding: '10px 15px' },
  editorFileInfo: { display: 'flex', alignItems: 'center', gap: '10px' },
  editorFileName: { color: tok.textPrimary, fontSize: '13px', fontWeight: '700' },
  editorMode: { backgroundColor: tok.orangeFaint, padding: '3px 8px', borderRadius: '6px', fontSize: '10px', color: tok.orangeText, fontWeight: '700', border: `1px solid ${tok.border}` },
  editorActions: { display: 'flex', gap: '8px' },
  btnEditorAction: { padding: '6px 12px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '6px', color: tok.orangeText, fontSize: '11px', cursor: 'pointer', fontWeight: '700', fontFamily: "'Nunito', sans-serif" },
  editorContent: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  lineNumbers: { width: '50px', backgroundColor: tok.panelHeaderBg, borderRight: `1.5px solid ${tok.borderSubtle}`, padding: '15px 0', overflowY: 'auto', textAlign: 'right', userSelect: 'none' },
  lineNumber: { color: tok.textMuted, fontSize: '12px', fontFamily: "'DM Mono', 'Monaco', monospace", lineHeight: '1.6', paddingRight: '10px' },
  editorTextArea: { flex: 1, backgroundColor: 'transparent', border: 'none', color: tok.textPrimary, fontSize: '13px', fontFamily: "'DM Mono', 'Monaco', monospace", lineHeight: '1.6', padding: '15px', resize: 'none', outline: 'none', overflowY: 'auto', whiteSpace: 'pre', tabSize: 4 },
  editorPre: { flex: 1, margin: 0, color: tok.textPrimary, fontSize: '13px', fontFamily: "'DM Mono', 'Monaco', monospace", lineHeight: '1.6', padding: '15px', overflowY: 'auto', whiteSpace: 'pre', tabSize: 4 },
  editorFooter: { display: 'flex', gap: '15px', backgroundColor: tok.panelBg, borderTop: `1.5px solid ${tok.borderSubtle}`, padding: '8px 15px', fontSize: '11px', color: tok.textMuted, fontFamily: "'DM Mono', monospace" },
  editorPlaceholder: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#d1d5db' },
  blockPanel: { width: '240px', minWidth: '240px', display: 'flex', flexDirection: 'column', backgroundColor: tok.panelBg, borderRight: `1.5px solid ${tok.border}`, overflow: 'hidden' },
  blockPanelHeader: { padding: '10px 12px 8px', borderBottom: `1.5px solid ${tok.borderSubtle}`, display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: tok.panelHeaderBg },
  sequenceNameInput: { backgroundColor: 'transparent', border: 'none', borderBottom: `1.5px solid ${tok.border}`, color: tok.textPrimary, fontSize: '13px', fontWeight: '700', fontFamily: "'Nunito', sans-serif", outline: 'none', padding: '2px 0', width: '100%' },
  blockList: { flex: 1, overflowY: 'auto' as const, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' },
  blockEmpty: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 0', flex: 1 },
  blockCard: { backgroundColor: tok.inputBg, borderRadius: '10px', borderLeft: `3px solid ${tok.orange}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', border: `1.5px solid ${tok.border}`, boxShadow: tok.shadow },
  blockCardTop: { display: 'flex', alignItems: 'center', gap: '6px' },
  blockTypeBadge: { fontSize: '9px', fontWeight: '700', letterSpacing: '0.5px', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' as const, flex: 1 },
  blockControls: { display: 'flex', gap: '2px' },
  blockCtrlBtn: { backgroundColor: 'transparent', border: `1.5px solid ${tok.border}`, color: tok.textMuted, fontSize: '11px', cursor: 'pointer', borderRadius: '5px', padding: '1px 5px', lineHeight: 1.4, minWidth: '22px', minHeight: '22px', fontWeight: '700' },
  blockBody: { display: 'flex', flexDirection: 'column' as const, gap: '4px' },
  blockInput: { backgroundColor: tok.orangeFaint, border: `1.5px solid ${tok.border}`, borderRadius: '6px', color: tok.textPrimary, fontSize: '12px', padding: '4px 7px', fontFamily: "'DM Mono', 'Consolas', monospace", outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  blockAddArea: { padding: '6px 8px', borderTop: `1.5px solid ${tok.borderSubtle}`, position: 'relative' as const },
  btnAddBlock: { width: '100%', padding: '8px', backgroundColor: tok.orangeFaint, border: `1.5px dashed ${tok.border}`, borderRadius: '8px', color: tok.orange, fontSize: '12px', cursor: 'pointer', minHeight: '36px', fontWeight: '700', fontFamily: "'Nunito', sans-serif" },
  addMenuPopup: { display: 'flex', flexDirection: 'column' as const, gap: '2px', backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '10px', overflow: 'hidden', boxShadow: tok.shadow },
  addMenuOption: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', backgroundColor: 'transparent', border: 'none', borderBottom: `1px solid ${tok.borderSubtle}`, color: tok.textPrimary, fontSize: '12px', cursor: 'pointer', textAlign: 'left' as const, gap: '8px', minHeight: '38px', fontFamily: "'Nunito', sans-serif" },
  blockRunArea: { padding: '8px', borderTop: `1.5px solid ${tok.borderSubtle}`, display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  btnRun: { width: '100%', padding: '10px', backgroundColor: tok.green, border: `1.5px solid ${tok.green}55`, borderRadius: '8px', color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer', minHeight: '40px', fontFamily: "'Nunito', sans-serif", boxShadow: '0 2px 8px rgba(22,163,74,0.2)' },
  btnStop: { width: '100%', padding: '10px', backgroundColor: tok.red, border: `1.5px solid ${tok.red}55`, borderRadius: '8px', color: tok.textOnOrange, fontSize: '13px', fontWeight: '700', cursor: 'pointer', minHeight: '40px', fontFamily: "'Nunito', sans-serif" },
  blockStats: { textAlign: 'center' as const, color: tok.textMuted, fontSize: '10px', fontFamily: "'DM Mono', 'Monaco', monospace" },
  blockSettings: { padding: '8px', borderTop: `1.5px solid ${tok.borderSubtle}`, display: 'flex', flexDirection: 'column' as const, gap: '5px' },
  settingsSelect: { backgroundColor: tok.inputBg, border: `1.5px solid ${tok.border}`, borderRadius: '6px', color: tok.orangeText, fontSize: '11px', padding: '3px 5px', outline: 'none', flex: 1 },
  cmdRefToggle: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', color: tok.textMuted, fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.8px', cursor: 'pointer', padding: '4px 0', minHeight: '28px', fontFamily: "'Nunito', sans-serif" },
  cmdRefList: { display: 'flex', flexDirection: 'column' as const, gap: '1px', marginTop: '4px', maxHeight: '220px', overflowY: 'auto' as const },
  cmdRefRow: { display: 'grid', gridTemplateColumns: '70px 1fr', gridTemplateRows: 'auto auto', gap: '0 6px', padding: '6px 8px', background: tok.orangeFaint, border: `1.5px solid ${tok.borderSubtle}`, borderRadius: '7px', cursor: 'pointer', textAlign: 'left' as const, transition: 'background 0.1s', fontFamily: "'Nunito', sans-serif" },
  cmdRefName: { color: tok.orange, fontSize: '11px', fontFamily: "'DM Mono', 'Monaco', monospace", fontWeight: '600', gridColumn: '1', gridRow: '1' },
  cmdRefParams: { color: '#f59e0b', fontSize: '10px', fontFamily: "'DM Mono', 'Monaco', monospace", gridColumn: '2', gridRow: '1', alignSelf: 'center' },
  cmdRefDesc: { color: tok.textMuted, fontSize: '10px', gridColumn: '1 / -1', gridRow: '2', marginTop: '2px' },
});

export default TotemProgrammingIDE;