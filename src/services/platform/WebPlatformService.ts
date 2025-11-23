// src/services/platform/WebPlatformService.ts
// Simplified - serial port opening is handled directly in TotemProgrammingIDE

import type { IPlatformService, SerialDevice } from '../../types/platform';

export class WebPlatformService implements IPlatformService {
  isElectron(): boolean {
    return false;
  }

  isWeb(): boolean {
    return true;
  }

  getPlatform(): 'web' {
    return 'web';
  }

  // List granted serial ports (does NOT open them)
  async listSerialDevices(): Promise<SerialDevice[]> {
    if (!('serial' in navigator)) {
      console.warn('Web Serial API not supported');
      return [];
    }

    try {
      const ports = await (navigator as any).serial.getPorts();
      
      return ports.map((port: any, index: number) => {
        const info = port.getInfo();
        const vendorId = info?.usbVendorId?.toString(16).padStart(4, '0');
        const productId = info?.usbProductId?.toString(16).padStart(4, '0');
        const id = `port-${vendorId || 'xxxx'}-${productId || 'xxxx'}-${index}`;
        
        let name = `Serial Device ${index}`;
        if (vendorId === '0483') {
          name = `STMicroelectronics Device`;
        }
        
        return { id, name, vendorId, productId };
      });
    } catch (error) {
      console.error('Error listing serial devices:', error);
      return [];
    }
  }

  // These methods are not used - serial handled in TotemProgrammingIDE
  async openSerialPort(deviceId: string, baudRate: number): Promise<void> {
    console.warn('openSerialPort called on WebPlatformService - use TotemProgrammingIDE instead');
  }

  async closeSerialPort(deviceId: string): Promise<void> {
    console.warn('closeSerialPort called on WebPlatformService - use TotemProgrammingIDE instead');
  }

  async writeSerial(deviceId: string, data: string): Promise<void> {
    console.warn('writeSerial called on WebPlatformService - use TotemProgrammingIDE instead');
  }

  onSerialData(deviceId: string, callback: (data: string) => void): void {
    console.warn('onSerialData called on WebPlatformService - use TotemProgrammingIDE instead');
  }

  removeSerialDataListener(deviceId: string): void {
    // No-op
  }

  // LocalStorage-based storage
  async setItem(key: string, value: any): Promise<void> {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error setting item:', error);
    }
  }

  async getItem(key: string): Promise<any> {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Error getting item:', error);
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }

  async saveFile(filename: string, data: string): Promise<void> {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async openFile(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            resolve(event.target?.result as string);
          };
          reader.readAsText(file);
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  }
}