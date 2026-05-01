# MakeyDooey Web Application

> A browser-based IDE for flashing firmware, monitoring serial output, and controlling modular embedded hardware — no installation required.

![MakeyDooey Platform](https://img.shields.io/badge/Platform-STM32%20%7C%20ESP32-blue)
![PWA Ready](https://img.shields.io/badge/PWA-Ready-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![React](https://img.shields.io/badge/React-19.x-61dafb)

**Live at:** https://makeydooey.github.io/Software

---

## 🚀 Features

### 🏠 Landing Page
- Animated boot-sequence terminal on first visit (skipped for returning users)
- Entry point to the IDE and Demo Mode
- Dark/light mode toggle persisted per account

### 👤 User Accounts (Supabase Auth)
- Sign up / log in with email and password
- Theme preference synced to the cloud — your settings follow you across devices
- Password reset via email link
- Admin panel for account management (admin-only)

### 🎮 Demo Mode
- Runs the full IDE with a virtual hardware simulator — no physical board needed
- End-to-end serial simulation via `virtualSerialSimulator.ts`
- Ideal for exploring the interface before connecting real hardware

### 🔌 Device Management
- **Automatic USB Detection** - Recognizes STM32 Nucleo and ESP32 boards automatically via USB VID/PID
- **Multi-Device Support** - Manage multiple connected totems simultaneously
- **Real-time Status** - Live connection monitoring with power, programming, and runtime state

### ⚡ Flash Tab
- **Drag & Drop Firmware** - Drop `.bin`, `.hex`, `.elf`, `.c`, `.cpp`, `.ino`, `.py` files directly
- **Built-in Code Editor** - View and edit source files with line numbers, edit/view mode toggle, and unsaved-change tracking
- **File Creation** - Create new files from scratch or load built-in examples (e.g. ESP32-S3 LED Blink)
- **One-Click Flashing** - Flash pre-compiled binaries with real-time progress bar
- **Activity Log** - Timestamped log of all flash and file operations

### 📟 Monitor Tab
- **Block Sequencer** - Build reusable command sequences by stacking blocks:
  - `CMD` — Send any serial command, with inline param fields for known commands
  - `DELAY` — Wait N milliseconds between steps (prevents UART overruns in sequences)
  - `WAIT FOR` — Pause until a specific string appears in serial output (e.g. `Ready>`) with configurable timeout
- **Persistent Sequences** - Block stacks and sequence names saved to localStorage and restored on reload
- **Sequential Execution** - Run the full stack in order with per-block status indicators (running / done / error) and a Stop button
- **Serial Terminal** - Full bidirectional terminal with auto-scroll, command history (↑↓), and manual input
- **Character-by-Character Transmission** - 10ms delay prevents UART buffer overruns (Nucleo/Main Totem)
- **Baud Rate & Line Ending** - Configurable per session (115200 / 57600 / 9600, CR / LF / CRLF)
- **BenjiPanel** - Motor Totem control panel, auto-shown when an ESP32 Motor Totem is connected:
  - Hold-to-run stepper and DC motor buttons (single-character raw byte TX, no delay or line endings)
  - Live JSON telemetry display (`v1`, `v2`, `en`, `sg0`) streamed every 100ms
  - Sensorless stallguard calibration trigger

### 🌙 Dark / Light Mode
- Warm cream and orange brand palette in light mode
- Deep aubergine and navy in dark mode
- All colors routed through `ThemeContext` token system — no hardcoded values

---

## 📋 Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Modern Browser** with Web Serial API support:
  - Chrome 89+
  - Edge 89+
  - Opera 76+
  - (Firefox and Safari do not support Web Serial API)

---

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

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Both values are available in your Supabase project dashboard under **Project Settings → API**.

---

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```
Opens at `http://localhost:5173`. Hot reload enabled.

### Production Build
```bash
npm run build
```
Output in `dist/` directory.

### Preview Production Build
```bash
npm run preview
```
Opens at `http://localhost:4173`.

### Electron Desktop App
```bash
npm run electron:dev        # development
npm run electron:build      # production build
```

---

## 📱 PWA Installation

### On Desktop (Chrome/Edge)
1. Open the app in Chrome or Edge
2. Look for the install icon (⊕) in the address bar
3. Click "Install MakeyDooey"
4. App appears as a standalone window

### On Mobile (Android)
1. Open in Chrome Mobile
2. Tap menu (⋮) → "Add to Home screen"

### Offline Support
- Service worker caches the app shell
- Works offline after first load

---

## ☁️ Deployment (GitHub Pages)

The app deploys automatically via GitHub Actions on every push to `main`.

Required setup:
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` added as GitHub repository secrets and included in the `env:` block of the build step
- Supabase **Site URL** and **Redirect URLs** set to `https://makeydooey.github.io/Software` for password reset to work
- `vite.config.ts` must use `base: '/Software/'`

---

## 🏗️ Project Structure

```
src/
├── components/
│   ├── LandingPage.tsx          # Boot animation, entry point
│   ├── TopBar.tsx               # Nav bar, theme toggle, user menu
│   ├── TotemPoleVisualizer.tsx  # Device discovery, demo mode, pole config
│   ├── TotemProgrammingIDE.tsx  # Flash + Monitor IDE
│   ├── AuthModal.tsx            # Sign up / log in modal
│   ├── AdminPanel.tsx           # Admin user management
│   └── ResetPasswordPage.tsx    # Password reset flow
├── context/
│   └── AuthContext.tsx          # Supabase session state
├── theme/
│   └── ThemeContext.tsx         # Dark/light mode token system
├── hooks/
│   ├── useUserSettings.ts       # Cloud settings sync
│   └── useAdmin.ts              # Admin role check
├── services/
│   ├── usbService.ts            # Web Serial API, VID/PID detection
│   ├── virtualSerialSimulator.ts # Demo mode simulation
│   ├── demoModeService.ts       # Demo mode orchestration
│   └── platform/
│       ├── index.ts             # Platform factory (Web vs Electron)
│       ├── WebPlatformService.ts
│       └── ElectronPlatformService.ts
├── types/
│   ├── totem.ts
│   └── platform.ts
├── lib/
│   └── supabaseClient.ts
├── App.tsx
└── main.tsx
```

---

## 🔧 Configuration

### USB Device Support
The app automatically detects devices by USB VID/PID:

**STMicroelectronics (Nucleo)**
- VID: `0x0483` — PIDs: `0x5740`, `0x374b`, `0x374a`

**Espressif (ESP32)**
- VID: `0x303a` (native), `0x10c4` (CP210x), `0x1a86` (CH340)

### Serial Communication
```typescript
const serialOptions = {
  baudRate: 115200,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
};
```

---

## 📖 User Manual

### 1. Open the App
Navigate to [makeydooey.github.io/Software](https://makeydooey.github.io/Software) in Chrome or Edge. A boot-sequence animation plays on first visit — click through or wait for it to finish.

### 2. Create an Account *(optional)*
Click the user icon in the top-right → **Sign Up**. An account saves your theme preference to the cloud. The app is fully usable without one.

### 3. Try Demo Mode
Click **Demo Mode** from the landing page. The full IDE loads with a simulated device — no hardware needed.

### 4. Connect a Board
1. Plug your STM32 Nucleo or ESP32 into your computer via USB
2. The board appears in the **Detected Totems** panel on the left
3. Click it to open the programming IDE

> **Note:** Chrome holds an exclusive lock on the serial port. Close Arduino IDE, VS Code Serial Monitor, or any other serial tool before connecting. On Mac, run `sudo lsof | grep usbmodem` to find and kill a stuck process.

### 5. Flash Firmware
1. Open the **Flash** tab
2. Drag a firmware file onto the drop zone, or click to browse
3. Confirm the detected board type is correct
4. Click **Flash to Board** and wait for the progress bar to complete

> If you need to re-upload via the Arduino IDE, click **Disconnect** in the Monitor tab first, then reconnect after uploading.

### 6. Monitor Serial Output
1. Open the **Monitor** tab
2. Click **Connect** and select your port from the browser popup
3. Type a command and press Enter

Common Nucleo (Main Totem) commands:
```
hello                         → test connectivity
toggle-led                    → toggle onboard LED
set_pid 1.0 0.0 0.05 1       → set PID gains
get_pid                       → read current PID values
status                        → print device status
```

### 7. Build a Command Sequence
1. In the Monitor tab, click **+ Add Block**
2. Stack `CMD`, `DELAY`, and `WAIT FOR` blocks in order
3. Click **▶ Run Sequence** — each block shows a live status badge
4. Your sequence is saved automatically and restored on next load

**Boot handshake example:**
```
WAIT FOR   Ready>    (timeout: 5000ms)
CMD        hello
DELAY      100ms
CMD        status
```

**PID tuning example:**
```
CMD    set_pid 1.0 0.0 0.0 1
DELAY  200ms
CMD    get_pid
CMD    status
```

### 8. Control the Motor Totem (BenjiPanel)
When an ESP32 Motor Totem is connected, **BenjiPanel** appears automatically in the Monitor tab.
- Hold motor buttons to drive steppers or DC motors — release to stop
- Live telemetry (`v1`, `v2`, `en`, `sg0`) updates every 100ms
- Click **Calibrate** to trigger sensorless stallguard homing

### 9. Dark Mode
Click the sun/moon icon in the top bar. If logged in, your preference is saved to your account.

---

## 🔍 Troubleshooting

### Board Not Detected
- Use a data USB cable (not charge-only)
- Try a different USB port
- On Windows: install ST-Link drivers (Nucleo) or CP210x/CH340 drivers (ESP32)
- Confirm you are on Chrome or Edge

### Port Already in Use
- Close Arduino IDE, VS Code Serial Monitor, or any other serial tool
- On Mac: `sudo lsof | grep usbmodem` → kill the blocking process
- Click **Disconnect** in the Monitor tab before uploading from an external tool

### Monitor No Response
- Confirm baud rate matches firmware (usually 115200)
- Send `hello` — if the board responds, the connection is working
- Reset the board while the monitor is open

### ESP32-S3 Flash Fails (stub error `0107`)
- Boards with embedded PSRAM require `--no-stub` mode
- Add a `platform.local.txt` override or pass the flag directly to esptool

### Password Reset Email Not Arriving
- Check your spam folder
- Supabase free tier caps at 3 emails/hour — wait and retry

### UART Garbled Output
- Character delay is already set to 10ms for Main Totem communication
- If still occurring, increase firmware UART buffer size to 256+ bytes

---

## 🌐 Browser Compatibility

| Browser | PWA | Web Serial API | Status |
|---------|-----|----------------|--------|
| Chrome 89+ | ✅ | ✅ | Fully Supported |
| Edge 89+ | ✅ | ✅ | Fully Supported |
| Opera 76+ | ✅ | ✅ | Fully Supported |
| Firefox | ✅ | ❌ | No USB support |
| Safari | ✅ | ❌ | No USB support |

---

## 🚧 Development

```bash
npm run lint          # ESLint
npm run build         # type-check + production build
```

---

## 🤝 Team

**MakeyDooey Senior Design Capstone — Boston University ECE FR3, 2025–26**

| Name | Role |
|------|------|
| Koen Lin | Frontend & Desktop Application Lead |
| Leo Martins | STM32 firmware, FreeRTOS, UART protocol |
| Dominic Murphy | ShamanLink PCB hardware lead |
| Vikram Singh Bhalla | Motor driver PCB |
| Benjamin Joseph | ESP32 Motor Totem firmware, Roxanne integration |
| Jonathan | Enclosure / CAD design |

---

## 🐛 Known Issues

- **Mac USB Device Naming** — macOS may show different device names than Windows
- **ESP32-S3 PSRAM** — requires `--no-stub` flag for flashing
- **Supabase email rate limit** — free tier capped at 3 password reset emails/hour

## 🔮 Future Work

- [ ] xterm.js terminal integration
- [ ] WCAG 2.2 full accessibility audit
- [ ] Custom ShamanLink VID/PID auto-detection
- [ ] Named sequence presets (save/load multiple sequences)
- [ ] Waveform / data visualization in Monitor
- [ ] Resend / custom SMTP for Supabase email

---

## 📞 Support

For questions, bug reports, or general inquiries, email us at **ddmurphy@makeydooey.org**

GitHub Issues: [MakeyDooey/Software/issues](https://github.com/MakeyDooey/Software/issues)

---

*Making embedded systems development accessible to everyone.*
