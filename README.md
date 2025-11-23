# MakeyDooey Frontend Documentation

## 📋 Table of Contents
- [Overview](#overview)
- [Setup Instructions](#setup-instructions)
- [Architecture](#architecture)
- [Key Components](#key-components)
- [Platform Abstraction](#platform-abstraction)
- [Serial Communication](#serial-communication)
- [Features by Tab](#features-by-tab)
- [Development Workflow](#development-workflow)

## 🎯 Overview

The MakeyDooey frontend is a hybrid React application that runs both as a Progressive Web App (PWA) in browsers and as an Electron desktop application. It provides a visual programming interface for STM32 Nucleo and ESP32 microcontrollers with real-time serial communication, firmware flashing, and PID parameter tuning.

**Tech Stack:**
- React 19 with TypeScript
- Vite for build tooling
- Electron for desktop deployment
- Web Serial API (browser) / Node.js serialport (desktop)
- electron-store for desktop persistence

## 🚀 Setup Instructions

### Prerequisites
```bash
# Required
Node.js >= 18.x
npm >= 9.x

# Verify installation
node --version
npm --version
```

### Initial Setup

1. **Clone the repository**
```bash
git clone git@github.com:MakeyDooey/Software.git
cd Software
git checkout desktop-app
```

2. **Install dependencies**
```bash
npm install
```

### Running the Application

#### Web/Browser Mode (PWA)
```bash
# Development server with hot reload
npm run dev

# Open in browser (Chrome, Edge, or Opera recommended)
# Navigate to: http://localhost:5173
```

**Browser Requirements:**
- Chrome 89+, Edge 89+, or Opera 76+ (Web Serial API support)
- HTTPS or localhost (required for Web Serial API)
- User must grant serial port permissions when prompted

#### Desktop Mode (Electron)
```bash
# Development mode with hot reload
npm run electron:dev

# This will:
# 1. Start Vite dev server
# 2. Wait for server to be ready
# 3. Launch Electron window
```

### Building for Production

#### PWA Build
```bash
npm run build:pwa

# Output: dist/
# Deploy to any static hosting (Netlify, Vercel, GitHub Pages, etc.)
```

#### Desktop Builds
```bash
# Windows
npm run electron:build:win

# macOS
npm run electron:build:mac

# Linux
npm run electron:build:linux

# All platforms
npm run electron:build
```

Built applications will be in `dist/` directory.

## 🏗️ Architecture

### Project Structure
```
├── public/
│   ├── electron.cjs          # Electron main process
│   ├── preload.cjs           # Electron preload script (IPC bridge)
│   └── manifest.json         # PWA manifest
├── src/
│   ├── components/
│   │   ├── TotemPoleVisualizer.tsx    # Main device visualizer
│   │   └── TotemProgrammingIDE.tsx    # IDE with tabs
│   ├── services/
│   │   ├── platform/
│   │   │   ├── index.ts                    # Platform service factory
│   │   │   ├── WebPlatformService.ts       # Browser implementation
│   │   │   ├── ElectronPlatformService.ts  # Desktop implementation
│   │   │   └── demoModeService.ts          # Simulator for testing
│   │   └── usbService.ts                   # USB device detection
│   ├── types/
│   │   ├── platform.ts        # Platform abstraction types
│   │   └── totem.ts          # Device/totem types
│   ├── App.tsx               # Root component
│   ├── main.tsx             # Entry point
│   └── App.css              # Styles
├── package.json
├── vite.config.ts
└── tsconfig.json
```

### Design Patterns

**Platform Abstraction Layer**: Unified interface (`IPlatformService`) implemented differently for web and desktop environments.

**Service Pattern**: Encapsulated business logic in service modules (USB detection, serial communication, virtual simulation).

**Component-Based Architecture**: React components with clear separation of concerns.

## 🧩 Key Components

### App.tsx
Root component managing global state and component orchestration.

```typescript
- State: programmingTotem (currently selected device)
- Renders: TotemPoleVisualizer + TotemProgrammingIDE (when device selected)
- Handles: Device selection, modal opening/closing
```

### TotemPoleVisualizer.tsx
Visual representation of connected USB devices.

```typescript
Features:
- Real-time USB device detection
- Visual totem stack display
- Device info cards (name, status, type)
- Double-click to open IDE
- Auto-refresh device list
```

### TotemProgrammingIDE.tsx
Main IDE interface with 4 specialized tabs.

```typescript
Features:
- Tab-based interface (Flash, Config, Monitor, Debug)
- Serial port management
- Command builder for Nucleo boards
- Real-time terminal output
- PID parameter tuning (Nucleo-specific)
- Board-specific UI (ESP32 vs Nucleo)
```

## 🔌 Platform Abstraction

### IPlatformService Interface

Provides unified API across environments:

```typescript
interface IPlatformService {
  // Platform detection
  isElectron(): boolean;
  isWeb(): boolean;
  getPlatform(): 'electron' | 'web';

  // Serial communication
  listSerialDevices(): Promise<SerialDevice[]>;
  openSerialPort(deviceId: string, baudRate: number): Promise<void>;
  closeSerialPort(deviceId: string): Promise<void>;
  writeSerial(deviceId: string, data: string): Promise<void>;
  onSerialData(deviceId: string, callback: (data: string) => void): void;

  // Storage
  setItem(key: string, value: any): Promise<void>;
  getItem(key: string): Promise<any>;
  
  // Desktop-only (optional)
  saveFile?(filename: string, data: string): Promise<void>;
  checkForUpdates?(): Promise<void>;
}
```

### Implementation Details

**WebPlatformService.ts** (Browser)
- Uses Web Serial API for device communication
- localStorage for persistence
- File API for firmware uploads
- Requires HTTPS or localhost

**ElectronPlatformService.ts** (Desktop)
- Uses Node.js `serialport` library
- electron-store for persistence
- Native file system access
- No HTTPS requirement

**demoModeService.ts** (Simulator)
- Virtual serial port for testing
- No hardware required
- Pre-programmed responses for common commands

### Usage Pattern

```typescript
import { platformService } from './services/platform';

// Automatically uses correct implementation
const devices = await platformService.listSerialDevices();
await platformService.openSerialPort(deviceId, 115200);
await platformService.writeSerial(deviceId, "hello\r");
```

## 📡 Serial Communication

### Connection Flow

1. **Device Detection**: USB service polls for connected devices
2. **Port Opening**: Platform service opens serial connection at 115200 baud
3. **Data Transmission**: Character-by-character with configurable delay (10ms default)
4. **Data Reception**: Async callback handling for incoming data

### Character-by-Character Transmission

Critical for preventing UART buffer overrun:

```typescript
async function sendCommand(command: string) {
  for (let i = 0; i < command.length; i++) {
    await platformService.writeSerial(deviceId, command[i]);
    await delay(charDelay); // Default 10ms
  }
  await platformService.writeSerial(deviceId, lineEnding); // '\r'
}
```

### Protocol Support

**Nucleo (Binary Protocol)**
- Structured packets: `[SOF][TYPE][LEN][PAYLOAD][CRC]`
- JSON commands wrapped in binary envelope
- Telemetry data with PID values
- ACK/NACK responses

**ESP32 (Text Protocol)**
- Simple newline-terminated commands
- AT-style command set
- Plain text responses

## 📑 Features by Tab

### 1. Flash Firmware Tab
Upload firmware to microcontrollers.

**Features:**
- File selector for `.bin` firmware files
- Device dropdown (auto-populated from USB detection)
- Progress bar during upload
- Upload logs with timestamps
- Error handling and retry logic

**Implementation:**
```typescript
- File handling via File API
- Binary chunking (4KB chunks)
- Stop-and-wait protocol (wait for ACK per chunk)
- Timeout handling (2s per chunk)
```

### 2. Configuration Tab
Device and communication settings.

**Features:**
- Baud rate selection (115200 default)
- Character delay adjustment (prevent buffer overrun)
- Line ending selection (\r, \n, \r\n)
- Save/load configurations
- Platform-specific settings

### 3. Monitor Tab
Real-time serial communication interface.

**Features:**
- Terminal-style output display
- Command history (up/down arrow navigation)
- Auto-scroll
- Clear output button
- Timestamp toggle
- Export logs

**Board-Specific UI:**

**Nucleo Boards:**
- Command builder dropdown (hello, toggle-led, set_pid, etc.)
- Parameter input fields (dynamic based on command)
- PID tuning sliders (P, I, D gains)
- Preset modes: Rock, Paper, Scissors
- Live telemetry display

**ESP32 Boards:**
- Simple command input
- Standard terminal interface
- Custom command support

### 4. Debug Tab
Advanced debugging and diagnostics.

**Features:**
- Byte-level communication viewer
- Sent/received data with hex display
- Packet analyzer (for binary protocols)
- Connection diagnostics
- Platform info display
- Error log viewer

## 🛠️ Development Workflow

### Running Tests
```bash
# Unit tests (when implemented)
npm test

# Linting
npm run lint
```

### Hot Reload Development

**Web Mode:**
- Vite provides instant HMR
- Changes reflect immediately
- No page refresh needed for most changes

**Desktop Mode:**
- Vite dev server + Electron wrapper
- React changes hot reload
- Electron main process changes require restart

### Debugging

**Browser DevTools (Web):**
```bash
npm run dev
# Open http://localhost:5173
# F12 for DevTools
# Console, Network, Sources tabs available
```

**Electron DevTools (Desktop):**
```bash
npm run electron:dev
# DevTools open automatically in dev mode
# Ctrl+Shift+I to toggle
# Main process: Use VS Code debugger
```

### Common Development Tasks

**Adding a New Command:**
1. Add to `NUCLEO_COMMANDS` object in TotemProgrammingIDE.tsx
2. Define parameters and description
3. Test via command builder interface

**Supporting New Board Type:**
1. Add detection logic in `getBoardType()`
2. Create board-specific UI in render method
3. Add protocol handling in serial communication

**Adding New Tab:**
1. Add tab name to `activeTab` type
2. Create tab content component
3. Add tab button to navigation
4. Implement tab-specific functionality

### Build Optimization

**Development:**
- Source maps enabled
- No minification
- Fast rebuild times

**Production:**
- Tree shaking
- Code splitting
- Minification
- Asset optimization

## 🔧 Troubleshooting Development Issues

### Vite Build Errors
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### Electron Won't Start
```bash
# Check if port 5173 is in use
lsof -ti:5173 | xargs kill -9  # Mac/Linux
netstat -ano | findstr :5173   # Windows

# Restart dev server
npm run electron:dev
```

### Serial Port Access Denied (Mac)
```bash
# Check device permissions
ls -l /dev/tty.*

# Reset USB
sudo kextunload -b com.apple.driver.usb.IOUSBHostFamily
sudo kextload -b com.apple.driver.usb.IOUSBHostFamily
```

### TypeScript Errors
```bash
# Rebuild types
npm run build -- --force

# Check tsconfig
npx tsc --noEmit
```

## 📚 Additional Resources

- [Web Serial API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [Vite Documentation](https://vitejs.dev/)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

## 🤝 Contributing

### Code Style
- Use TypeScript strict mode
- Follow ESLint rules
- Prefer functional components
- Use async/await over promises
- Comment complex logic

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push to GitHub
git push origin feature/your-feature-name
```

### Pull Request Guidelines
- Clear description of changes
- Test on both web and desktop
- Update documentation if needed
- No console errors in production build

---

**Last Updated:** November 2024  
**Team:** MakeyDooey Capstone Project  
**Maintainer:** K (Frontend/Desktop Application)
