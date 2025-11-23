// src/services/platform/IPlatformService.ts

// Interface that both web and Electron implement
export interface SerialDevice {
  id: string;
  name: string;
  path?: string;
  vendorId?: string;
  productId?: string;
}

export interface IPlatformService {
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
  removeSerialDataListener(deviceId: string): void;

  // Storage
  setItem(key: string, value: any): Promise<void>;
  getItem(key: string): Promise<any>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;

  // File system (desktop only, gracefully degrades on web)
  saveFile?(filename: string, data: string): Promise<void>;
  openFile?(): Promise<string | null>;

  // Updates (desktop only)
  checkForUpdates?(): Promise<void>;
  installUpdate?(): Promise<void>;
}