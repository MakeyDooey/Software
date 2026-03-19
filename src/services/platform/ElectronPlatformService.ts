import type { IPlatformService, SerialDevice } from '../../types/platform';

export class ElectronPlatformService implements IPlatformService {
  private electronAPI: any;

  constructor() {
    this.electronAPI = (window as any).electronAPI;
    if (!this.electronAPI) {
      throw new Error('Electron API not available');
    }
  }

  isElectron(): boolean {
    return true;
  }

  isWeb(): boolean {
    return false;
  }

  getPlatform(): 'electron' {
    return 'electron';
  }

  // Node.js SerialPort implementation (via IPC)
  async listSerialDevices(): Promise<SerialDevice[]> {
    try {
      const ports = await this.electronAPI.serial.list();
      return ports.map((port: any) => ({
        id: port.path,
        name: port.path,
        vendorId: port.vendorId,
        productId: port.productId,
      }));
    } catch (error) {
      console.error('Error listing serial devices:', error);
      return [];
    }
  }

  async openSerialPort(deviceId: string, baudRate: number): Promise<void> {
    await this.electronAPI.serial.open(deviceId, baudRate);
  }

  async closeSerialPort(deviceId: string): Promise<void> {
    await this.electronAPI.serial.close(deviceId);
  }

  async writeSerial(deviceId: string, data: string): Promise<void> {
    await this.electronAPI.serial.write(deviceId, data);
  }

  onSerialData(deviceId: string, callback: (data: string) => void): void {
    this.electronAPI.serial.onData((data: { path: string; data: string }) => {
      if (data.path === deviceId) {
        callback(data.data);
      }
    });
  }

  removeSerialDataListener(deviceId: string): void {
    // Electron handles cleanup automatically when port closes
    if (this.electronAPI.serial.removeDataListener) {
      this.electronAPI.serial.removeDataListener();
    }
  }

  // Electron-store based storage
  async setItem(key: string, value: any): Promise<void> {
    await this.electronAPI.store.set(key, value);
  }

  async getItem(key: string): Promise<any> {
    return await this.electronAPI.store.get(key);
  }

  async removeItem(key: string): Promise<void> {
    await this.electronAPI.store.delete(key);
  }

  async clear(): Promise<void> {
    await this.electronAPI.store.clear();
  }

  // Native file system access
  async saveFile(filename: string, data: string): Promise<void> {
    await this.electronAPI.fs.saveFile(filename, data);
  }

  async openFile(): Promise<string | null> {
    return await this.electronAPI.fs.openFile();
  }

  // Desktop-only: Auto updates
  async checkForUpdates(): Promise<void> {
    await this.electronAPI.updater.check();
  }

  async installUpdate(): Promise<void> {
    await this.electronAPI.updater.install();
  }
}