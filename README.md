# MakeyDooey Web Application

> A comprehensive Progressive Web App (PWA) for programming and managing STM32 and ESP32 microcontrollers through an intuitive visual interface.

![MakeyDooey Platform](https://img.shields.io/badge/Platform-STM32%20%7C%20ESP32-blue)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![React](https://img.shields.io/badge/React-18.x-61dafb)

## 🚀 Features

### 🔌 Device Management
- **Automatic USB Detection** - Recognizes STM32 Nucleo and ESP32 boards automatically
- **Multi-Device Support** - Manage multiple connected totems simultaneously
- **Real-time Status** - Live connection monitoring and device health

### 📁 File Manager & Editor
- **Integrated File System** - Organize firmware, configs, and text files
- **Built-in Editor** - Edit text and JSON config files directly in browser
- **Persistent Storage** - Files saved to browser localStorage
- **File Types Supported**:
  - Binary firmware (`.bin`, `.hex`)
  - Configuration files (`.json`, `.config`)
  - Text files (`.txt`, `.md`)
- **Search & Filter** - Quick file lookup by name
- **Upload/Download** - Import from and export to local system

### ⚡ Flash Tab
- **One-Click Flashing** - Program your boards without command-line tools
- **Firmware Selection** - Choose from your file library
- **Progress Tracking** - Real-time flash status and verification
- **Error Recovery** - Clear error messages and recovery guidance

### 📊 Monitor Tab
- **Serial Terminal** - Bidirectional communication with hardware
- **115200 Baud** - Standard serial communication
- **Command Builder** - Pre-built commands for common operations:
  - `hello` - Test connection
  - `toggle-led` - Control onboard LED
  - `pid <p> <i> <d>` - PID control parameters
- **Live Console** - Real-time terminal output
- **Character-by-Character Transmission** - 10ms delay prevents UART buffer overruns

### ⚙️ Config Tab
- **Visual Configuration** - GUI for totem settings
- **JSON Config Support** - Load and save configuration files
- **Parameter Validation** - Ensures valid settings before applying

### 🐛 Debug Tab
- **Hardware Debugging** - Monitor and debug connected devices
- **Console Logging** - View system logs and debug output

## 📋 Prerequisites

- **Node.js** 16.x or higher
- **npm** 8.x or higher
- **Modern Browser** with Web Serial API support:
  - Chrome 89+
  - Edge 89+
  - Opera 76+
  - (Firefox and Safari do not support Web Serial API)

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/MakeyDooey/Software.git
cd Software
```

### 2. Install Dependencies
```bash
npm install --legacy-peer-deps
```

Note: Use `--legacy-peer-deps` flag to resolve any peer dependency conflicts.

### 3. Environment Setup
Create a `.env` file in the root directory (optional):
```env
VITE_APP_NAME=MakeyDooey
VITE_API_URL=http://localhost:3000
```

## 🚀 Running the Application

### Development Mode (PWA)
```bash
npm run dev
```
- Opens at `http://localhost:5173`
- Hot reload enabled
- Web Serial API works in supported browsers

### Production Build
```bash
npm run build
```
- Optimized production bundle
- Output in `dist/` directory

### Preview Production Build
```bash
npm run preview
```
- Test production build locally
- Opens at `http://localhost:4173`

### Electron Desktop App
```bash
# Development
npm run electron:dev

# Production Build
npm run electron:build
```

## 📱 PWA Installation

### On Desktop (Chrome/Edge)
1. Open the app in Chrome or Edge
2. Look for the install icon (⊕) in the address bar
3. Click "Install MakeyDooey"
4. App appears as standalone window

### On Mobile (Android)
1. Open in Chrome Mobile
2. Tap menu (⋮) → "Add to Home screen"
3. App appears on home screen like native app

### Offline Support
- Service worker caches app shell
- Works offline after first load
- File Manager data persists locally

## 🏗️ Project Structure

```
MakeyDooey/
├── src/
│   ├── components/
│   │   ├── FileManager.tsx        # File organizer & editor
│   │   ├── FileManager.css        # File manager styles
│   │   ├── TotemPoleVisualizer.tsx
│   │   └── TotemProgrammingIDE.tsx
│   ├── services/
│   │   ├── usbService.ts          # USB/Serial communication
│   │   ├── platform.ts            # Platform abstraction
│   │   ├── WebPlatformService.ts  # PWA implementation
│   │   └── ElectronPlatformService.ts
│   ├── types/
│   │   └── totem.ts               # TypeScript interfaces
│   ├── App.tsx                    # Main app component
│   ├── App.css                    # Global styles
│   └── main.tsx                   # Entry point
├── public/
│   ├── manifest.json              # PWA manifest
│   └── service-worker.js          # Service worker
├── electron/                      # Electron wrapper
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🔧 Configuration

### USB Device Support
The app automatically detects devices by USB VID/PID:

**STMicroelectronics (Nucleo)**
- VID: `0x0483`
- Common PIDs: `0x5740`, `0x374b`, `0x374a`

**Espressif (ESP32)**
- VID: `0x303a` (native)
- VID: `0x10c4` (CP210x)
- VID: `0x1a86` (CH340)

### Serial Communication
```typescript
// Default settings
const serialOptions = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
};
```

### Character Transmission Delay
The monitor tab uses a 10ms delay between characters to prevent UART buffer overruns on embedded systems:
```typescript
const CHAR_DELAY_MS = 10; // Prevents buffer overflow
```

## 📖 Usage Guide

### Getting Started Workflow

#### 1. Connect Your Board
- Plug in STM32 Nucleo or ESP32 via USB
- App automatically detects and lists device
- Check "Detected Totems" panel (left column)

#### 2. Manage Files
**Option A: Upload Firmware**
- Navigate to "Files" tab
- Click "↑ Upload"
- Select `.bin` or `.hex` file
- File appears in organized list

**Option B: Create Config**
- Click "+ New File"
- Choose "Config File"
- Name it (e.g., `totem_config.json`)
- Edit in built-in editor:
```json
{
  "led_pin": 13,
  "baud_rate": 115200,
  "enable_debug": true
}
```
- Click "💾 Save"

#### 3. Flash Firmware
- Switch to "Flash" tab
- Select your device from dropdown
- Select firmware file from list
- Click "Flash to Board"
- Wait for success notification

#### 4. Test Connection
- Switch to "Monitor" tab
- Terminal connects automatically
- Type `hello` and press Enter
- Should see response from board
- Try `toggle-led` to control LED

#### 5. Advanced Testing
**PID Control:**
```
pid 1.0 0.5 0.1
```

**Custom Commands:**
- Type any command your firmware supports
- 10ms character delay ensures reliability
- View real-time responses

## 🔍 Troubleshooting

### Device Not Detected
**Problem:** Board plugged in but not showing
**Solutions:**
- Check USB cable (must be data cable, not charge-only)
- Try different USB port
- On Windows: Install ST-Link or ESP32 drivers
- Check browser console for errors
- Verify browser supports Web Serial API

### Flash Failed
**Problem:** Flash operation fails
**Solutions:**
- Verify correct board selected
- Check firmware file is valid `.bin` or `.hex`
- Ensure board is not in use by another program
- Try resetting board before flashing
- Check file size matches board capacity

### Monitor No Response
**Problem:** Terminal connected but no output
**Solutions:**
- Verify baud rate is 115200
- Check firmware has serial output enabled
- Try sending `hello` command
- Reset board while monitor is open
- Check USB connection stability

### Files Not Persisting
**Problem:** Files disappear after refresh
**Solutions:**
- Check browser localStorage is enabled
- Clear site data and try again
- Verify storage quota not exceeded (5MB limit)
- Check browser private/incognito mode (localStorage disabled)

### UART Buffer Overrun
**Problem:** Garbled text or missing characters
**Solutions:**
- Already fixed! Character delay is 10ms
- If still occurring, firmware UART buffer may be too small
- Increase firmware buffer size to 256+ bytes

## 🌐 Browser Compatibility

| Browser | PWA Support | Web Serial API | Status |
|---------|-------------|----------------|--------|
| Chrome 89+ | ✅ | ✅ | Fully Supported |
| Edge 89+ | ✅ | ✅ | Fully Supported |
| Opera 76+ | ✅ | ✅ | Fully Supported |
| Firefox | ✅ | ❌ | PWA only (no USB) |
| Safari | ✅ | ❌ | PWA only (no USB) |

**Recommendation:** Use Chrome or Edge for full functionality.

## 🔐 Security & Permissions

### Required Permissions
- **Serial Port Access** - Required for USB communication
- **Storage** - For file persistence (localStorage)

### User Privacy
- All data stored locally in browser
- No cloud sync or external servers
- USB access requires explicit user permission per session

### Safe Operations
- Firmware verification before flash
- Confirmation dialogs for destructive actions
- Board connection validation
- Error recovery mechanisms

## 🚧 Development

### Run Tests
```bash
npm run test
```

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Format Code
```bash
npm run format
```

## 📦 Building for Production

### Web (PWA)
```bash
npm run build
```
Output: `dist/` directory
Deploy to any static hosting (Vercel, Netlify, GitHub Pages)

### Desktop (Electron)
```bash
# macOS
npm run electron:build:mac

# Windows
npm run electron:build:win

# Linux
npm run electron:build:linux
```

## 🤝 Team

**MakeyDooey Senior Design Capstone Team**
- **Koen Lin** - Frontend Lead (React/TypeScript, PWA Architecture)
- **Leo** - Firmware Development (FreeRTOS, UART Protocol)
- **Dom** - PCB Design (Custom Totem Hardware)
- **Ben** - Robotics Demo (Roxanne Prosthetic Hand)
- **Vikram** - Status LED Implementation
- **Jonny** - DIN-Rail Enclosure Design

## 📄 License

This project is part of a senior capstone project.

## 🐛 Known Issues

1. **Mac USB Device Naming** - macOS may show different device names than Windows
2. **ESP32-S3 PSRAM** - Requires `--no-stub` flag for flashing (handled automatically)
3. **Storage Limits** - Browser localStorage limited to ~5MB (sufficient for most use cases)

## 🔮 Future Enhancements

- [ ] Cloud file synchronization
- [ ] Collaborative editing
- [ ] Custom PCB auto-detection
- [ ] Git integration for firmware versions
- [ ] OTA (Over-The-Air) updates
- [ ] Multi-language support
- [ ] Custom command macros
- [ ] Waveform visualization in Debug tab

## 📞 Support

For issues, questions, or contributions:
- GitHub Issues: [MakeyDooey/Software/issues](https://github.com/MakeyDooey/Software/issues)
- Team Contact: [Your contact info]

## 🙏 Acknowledgments

- Anthropic Claude for development assistance
- STMicroelectronics for STM32 ecosystem
- Espressif for ESP32 platform
- Web Serial API working group

---

**Built with ❤️ by the MakeyDooey Team**

*Making embedded systems development accessible to everyone*