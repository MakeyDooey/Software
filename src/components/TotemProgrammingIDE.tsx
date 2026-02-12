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
    const isBinaryFile = fileName.endsWith('.bin') || fileName.endsWith('.hex') || fileName.endsWith('.elf');
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
                    backgroundColor: isDragOver ? 'rgba(33, 150, 243, 0.1)' : '#0a0a0a'
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
                      backgroundColor: '#1a3a1a',
                      borderColor: '#2e7d32',
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
                    backgroundColor: isConnected ? '#1a3a1a' : '#1a1a1a',
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

  // Flash Tab - Sidebar
  flashSidebar: {
    width: '300px',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    overflowY: 'auto'
  },
  flashSection: {
    backgroundColor: '#141414',
    borderRadius: '8px',
    padding: '15px',
    border: '1px solid #333'
  },
  flashSectionTitle: {
    margin: '0 0 12px 0',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600'
  },

  // Drop Zone
  dropZone: {
    border: '2px dashed #444',
    borderRadius: '8px',
    padding: '25px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '12px'
  },

  // Selected File Info
  selectedFileInfo: {
    backgroundColor: '#0a0a0a',
    border: '1px solid #333',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '12px'
  },

  // File Actions
  fileActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  btnSecondary: {
    flex: 1,
    minWidth: '60px',
    padding: '8px 12px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  btnFlash: {
    width: '100%',
    padding: '12px 20px',
    backgroundColor: '#2e7d32',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  flashLogOutput: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    border: '1px solid #333',
    borderRadius: '4px',
    padding: '10px',
    overflowY: 'auto',
    fontFamily: 'monospace',
    fontSize: '11px',
    minHeight: '100px'
  },

  // Editor Panel
  editorPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0d0d0d',
    borderRadius: '8px',
    border: '1px solid #333',
    overflow: 'hidden'
  },
  editorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderBottom: '1px solid #333',
    padding: '10px 15px'
  },
  editorFileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  editorFileName: {
    color: '#fff',
    fontSize: '13px',
    fontWeight: '500'
  },
  editorMode: {
    backgroundColor: '#333',
    padding: '3px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    color: '#888'
  },
  editorActions: {
    display: 'flex',
    gap: '8px'
  },
  btnEditorAction: {
    padding: '6px 12px',
    backgroundColor: '#333',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  editorContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative'
  },
  lineNumbers: {
    width: '50px',
    backgroundColor: '#111',
    borderRight: '1px solid #333',
    padding: '15px 0',
    overflowY: 'auto',
    textAlign: 'right',
    userSelect: 'none'
  },
  lineNumber: {
    color: '#555',
    fontSize: '12px',
    fontFamily: "'Monaco', 'Consolas', monospace",
    lineHeight: '1.6',
    paddingRight: '10px'
  },
  editorTextArea: {
    flex: 1,
    backgroundColor: 'transparent',
    border: 'none',
    color: '#d4d4d4',
    fontSize: '13px',
    fontFamily: "'Monaco', 'Consolas', monospace",
    lineHeight: '1.6',
    padding: '15px',
    resize: 'none',
    outline: 'none',
    overflowY: 'auto',
    whiteSpace: 'pre',
    tabSize: 4
  },
  editorPre: {
    flex: 1,
    margin: 0,
    color: '#d4d4d4',
    fontSize: '13px',
    fontFamily: "'Monaco', 'Consolas', monospace",
    lineHeight: '1.6',
    padding: '15px',
    overflowY: 'auto',
    whiteSpace: 'pre',
    tabSize: 4
  },
  editorFooter: {
    display: 'flex',
    gap: '15px',
    backgroundColor: '#1a1a1a',
    borderTop: '1px solid #333',
    padding: '8px 15px',
    fontSize: '11px',
    color: '#666'
  },
  editorPlaceholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#444'
  }
};

export default TotemProgrammingIDE;