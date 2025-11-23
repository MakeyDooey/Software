// src/services/usbService.ts
// USB Service with ESP32 and Nucleo board detection

import { platformService } from './platform';
import type { TotemStatus, USBConnectionEvent } from '../types/totem';

// =====================================================
// KNOWN DEVICE DATABASE
// =====================================================

interface KnownDevice {
  name: string;
  type: 'esp32' | 'nucleo' | 'generic';
  description: string;
}

// USB Vendor IDs and Product IDs for known devices
// Format: "vendorId:productId" -> device info
const KNOWN_DEVICES: { [key: string]: KnownDevice } = {
  // ===== ESP32 Devices =====
  // Espressif native USB (ESP32-S2, ESP32-S3, ESP32-C3)
  '303a:1001': { name: 'ESP32-S2', type: 'esp32', description: 'Espressif ESP32-S2' },
  '303a:1002': { name: 'ESP32-S3', type: 'esp32', description: 'Espressif ESP32-S3 CDC' },
  '303a:0002': { name: 'ESP32-S3', type: 'esp32', description: 'Espressif ESP32-S3' },
  '303a:0003': { name: 'ESP32-S3', type: 'esp32', description: 'Espressif ESP32-S3 JTAG' },
  '303a:1003': { name: 'ESP32-C3', type: 'esp32', description: 'Espressif ESP32-C3' },
  '303a:4001': { name: 'ESP32-S3 DevKit', type: 'esp32', description: 'ESP32-S3 DevKitC' },
  
  // Silicon Labs CP210x (common on ESP32 DevKits)
  '10c4:ea60': { name: 'ESP32 (CP2102)', type: 'esp32', description: 'Silicon Labs CP210x' },
  '10c4:ea70': { name: 'ESP32 (CP2105)', type: 'esp32', description: 'Silicon Labs CP2105' },
  
  // WCH CH340/CH341 (common on cheaper ESP32 boards)
  '1a86:7523': { name: 'ESP32 (CH340)', type: 'esp32', description: 'WCH CH340' },
  '1a86:5523': { name: 'ESP32 (CH341)', type: 'esp32', description: 'WCH CH341' },
  '1a86:55d4': { name: 'ESP32 (CH9102)', type: 'esp32', description: 'WCH CH9102' },
  
  // FTDI (some ESP32 boards)
  '0403:6001': { name: 'ESP32 (FTDI)', type: 'esp32', description: 'FTDI FT232' },
  '0403:6010': { name: 'ESP32 (FTDI)', type: 'esp32', description: 'FTDI FT2232' },
  '0403:6015': { name: 'ESP32 (FTDI)', type: 'esp32', description: 'FTDI FT231X' },
  
  // ===== STM32 Nucleo Devices =====
  // STMicroelectronics
  '0483:374b': { name: 'Nucleo-H743ZI', type: 'nucleo', description: 'STM32 Nucleo-144' },
  '0483:374e': { name: 'Nucleo Board', type: 'nucleo', description: 'STM32 Nucleo' },
  '0483:374f': { name: 'Nucleo Board', type: 'nucleo', description: 'STM32 Nucleo' },
  '0483:3752': { name: 'Nucleo Board', type: 'nucleo', description: 'STM32 Nucleo-32' },
  '0483:3753': { name: 'Nucleo Board', type: 'nucleo', description: 'STM32 Nucleo-64' },
  '0483:3754': { name: 'Nucleo Board', type: 'nucleo', description: 'STM32 Nucleo-144' },
  '0483:5740': { name: 'STM32 VCP', type: 'nucleo', description: 'STM32 Virtual COM Port' },
  '0483:5741': { name: 'STM32 VCP', type: 'nucleo', description: 'STM32 Virtual COM Port' },
  
  // ST-Link (Nucleo onboard debugger)
  '0483:3748': { name: 'Nucleo (ST-Link)', type: 'nucleo', description: 'ST-Link V2' },
  '0483:374a': { name: 'Nucleo (ST-Link)', type: 'nucleo', description: 'ST-Link V2-1' },
  '0483:374d': { name: 'Nucleo (ST-Link)', type: 'nucleo', description: 'ST-Link V3' },
  '0483:3744': { name: 'Nucleo (ST-Link)', type: 'nucleo', description: 'ST-Link' },
};

// Vendor ID lookup for generic identification
const VENDOR_NAMES: { [key: string]: { name: string, type: 'esp32' | 'nucleo' | 'generic' } } = {
  '303a': { name: 'Espressif', type: 'esp32' },
  '10c4': { name: 'Silicon Labs', type: 'esp32' },  // Often ESP32
  '1a86': { name: 'WCH', type: 'esp32' },           // Often ESP32
  '0403': { name: 'FTDI', type: 'generic' },
  '0483': { name: 'STMicroelectronics', type: 'nucleo' },
};

// =====================================================
// USB SERVICE CLASS
// =====================================================

class UnifiedUSBService {
  private connectedTotems: Map<string, TotemStatus> = new Map();
  private listeners: ((event: USBConnectionEvent) => void)[] = [];
  private isMonitoring: boolean = false;
  private scanInterval: number | null = null;
  private claimedPorts: Set<string> = new Set();

  isSupported(): boolean {
    if (platformService.isElectron()) {
      return true;
    } else {
      return 'serial' in navigator;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (platformService.isElectron()) {
      return true;
    }

    try {
      // Request a port - this triggers the browser permission dialog
      const port = await (navigator as any).serial.requestPort();
      
      // Get device info and identify it
      const info = port.getInfo();
      const totem = this.identifyDeviceByUSB(info, port);
      
      // Store the port for later use
      this.connectedTotems.set(totem.id, totem);
      
      // Notify listeners
      this.notifyListeners({
        action: 'connected',
        totem,
        timestamp: new Date()
      });
      
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) return;

    this.isMonitoring = true;

    // Initial scan of already-permitted ports
    await this.scanDevices();

    // Periodic scanning for changes
    this.scanInterval = window.setInterval(() => {
      this.scanDevices();
    }, 2000);

    console.log(`USB monitoring started (${platformService.getPlatform()})`);
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    this.connectedTotems.forEach((totem) => {
      if (!this.claimedPorts.has(totem.id)) {
        platformService.closeSerialPort(totem.id);
      }
    });

    this.connectedTotems.clear();
    console.log('USB monitoring stopped');
  }

  private async scanDevices(): Promise<void> {
    try {
      // Get all permitted ports
      const ports = await (navigator as any).serial.getPorts();
      
      const scannedIds = new Set<string>();
      
      for (let i = 0; i < ports.length; i++) {
        const port = ports[i];
        const info = port.getInfo();
        const deviceId = this.generateDeviceId(info, i);
        
        scannedIds.add(deviceId);
        
        // Check if this is a new device
        if (!this.connectedTotems.has(deviceId)) {
          const totem = this.identifyDeviceByUSB(info, port, deviceId);
          this.connectedTotems.set(deviceId, totem);
          
          this.notifyListeners({
            action: 'connected',
            totem,
            timestamp: new Date()
          });
        }
      }

      // Check for disconnections
      const currentIds = new Set(this.connectedTotems.keys());
      for (const id of currentIds) {
        if (!scannedIds.has(id) && !this.claimedPorts.has(id)) {
          const totem = this.connectedTotems.get(id);
          if (totem) {
            this.connectedTotems.delete(id);
            
            this.notifyListeners({
              action: 'disconnected',
              totem: { ...totem, connected: false },
              timestamp: new Date()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error scanning devices:', error);
    }
  }

  private generateDeviceId(info: any, index: number): string {
    const vid = info.usbVendorId?.toString(16).padStart(4, '0') || '0000';
    const pid = info.usbProductId?.toString(16).padStart(4, '0') || '0000';
    return `usb-${vid}-${pid}-${index}`;
  }

  private identifyDeviceByUSB(info: any, port: any, deviceId?: string): TotemStatus {
    const vid = info.usbVendorId?.toString(16).padStart(4, '0').toLowerCase() || '0000';
    const pid = info.usbProductId?.toString(16).padStart(4, '0').toLowerCase() || '0000';
    const lookupKey = `${vid}:${pid}`;
    
    console.log(`Identifying device: VID=0x${vid} PID=0x${pid}`);
    
    // Try exact match first
    let deviceInfo = KNOWN_DEVICES[lookupKey];
    
    // Try vendor-only match
    if (!deviceInfo && VENDOR_NAMES[vid]) {
      const vendor = VENDOR_NAMES[vid];
      deviceInfo = {
        name: `${vendor.name} Device`,
        type: vendor.type,
        description: `${vendor.name} (VID:${vid} PID:${pid})`
      };
    }
    
    // Default to unknown
    if (!deviceInfo) {
      deviceInfo = {
        name: 'Unknown Device',
        type: 'generic',
        description: `Unknown (VID:${vid} PID:${pid})`
      };
    }
    
    const id = deviceId || this.generateDeviceId(info, Date.now());
    
    console.log(`Identified as: ${deviceInfo.name} (${deviceInfo.type})`);
    
    return {
      id,
      position: 0,
      type: deviceInfo.type === 'esp32' ? 'mcu-controller' : 
            deviceInfo.type === 'nucleo' ? 'mcu-controller' : 'unknown',
      name: deviceInfo.name,
      serialNumber: `${vid.toUpperCase()}:${pid.toUpperCase()}`,
      connected: true,
      busAddress: 0,
      usbPort: lookupKey,
      powerState: 'powered',
      programmingState: 'not-programmed',
      runtimeState: 'idle',
      softwareFault: 'none',
      hardwareFault: 'none',
      capabilities: {
        hasADC: true,
        hasPWM: true,
        hasUART: true,
        hasI2C: true,
        gpioCount: deviceInfo.type === 'esp32' ? 34 : 
                   deviceInfo.type === 'nucleo' ? 80 : 0
      }
    };
  }

  // Port claiming - prevents usbService from closing ports that TotemProgrammingIDE is using
  claimPort(totemId: string): void {
    this.claimedPorts.add(totemId);
    console.log(`Port claimed: ${totemId}`);
  }

  releasePort(totemId: string): void {
    this.claimedPorts.delete(totemId);
    console.log(`Port released: ${totemId}`);
  }

  isPortClaimed(totemId: string): boolean {
    return this.claimedPorts.has(totemId);
  }

  getConnectedTotems(): TotemStatus[] {
    return Array.from(this.connectedTotems.values());
  }

  subscribe(callback: (event: USBConnectionEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(event: USBConnectionEvent): void {
    this.listeners.forEach(cb => {
      try {
        cb(event);
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }

  async sendCommand(totemId: string, command: string): Promise<string> {
    await platformService.writeSerial(totemId, command + '\n');
    return 'OK';
  }

  // Get device type for a totem
  getDeviceType(totem: TotemStatus): 'esp32' | 'nucleo' | 'unknown' {
    const name = totem.name.toLowerCase();
    
    if (name.includes('esp32') || name.includes('espressif') || 
        name.includes('cp210') || name.includes('ch340') || name.includes('ch9102')) {
      return 'esp32';
    }
    
    if (name.includes('nucleo') || name.includes('stm32') || 
        name.includes('st-link') || name.includes('stmicroelectronics')) {
      return 'nucleo';
    }
    
    // Check serial number (which contains VID:PID)
    const serial = totem.serialNumber?.toLowerCase() || '';
    if (serial.startsWith('303a') || serial.startsWith('10c4') || serial.startsWith('1a86')) {
      return 'esp32';
    }
    if (serial.startsWith('0483')) {
      return 'nucleo';
    }
    
    return 'unknown';
  }
}

export const usbService = new UnifiedUSBService();
export default usbService;