// src/services/demoModeService.ts
// This simulates real hardware for demo purposes

import type { TotemStatus, SoftwareFault, HardwareFault } from '../../types/totem';

export class DemoModeService {
  private demoTotems: TotemStatus[] = [];
  private updateInterval: number | null = null;
  private listeners: ((totems: TotemStatus[]) => void)[] = [];

  /**
   * Initialize demo mode with mock totems
   */
  startDemoMode(): TotemStatus[] {
    this.demoTotems = this.createMockTotems();
    
    // Simulate dynamic updates every 2 seconds
    this.updateInterval = window.setInterval(() => {
      this.simulateRuntimeUpdates();
      this.notifyListeners();
    }, 2000);

    return this.demoTotems;
  }

  /**
   * Stop demo mode
   */
  stopDemoMode(): void {
    if (this.updateInterval) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.demoTotems = [];
  }

  /**
   * Subscribe to demo updates
   */
  subscribe(callback: (totems: TotemStatus[]) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Get current demo totems
   */
  getDemoTotems(): TotemStatus[] {
    return this.demoTotems;
  }

  /**
   * Simulate programming a totem
   */
  async simulateProgramming(totemId: string): Promise<void> {
    const totem = this.demoTotems.find(t => t.id === totemId);
    if (!totem) return;

    // Simulate programming steps
    totem.programmingState = 'programming';
    this.notifyListeners();

    await new Promise(resolve => setTimeout(resolve, 3000));

    totem.programmingState = 'programmed';
    totem.firmwareVersion = `v${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 10)}.0`;
    totem.lastProgrammed = new Date();
    totem.runtimeState = 'idle';
    this.notifyListeners();
  }

  /**
   * Simulate starting program execution
   */
  simulateStart(totemId: string): void {
    const totem = this.demoTotems.find(t => t.id === totemId);
    if (!totem) return;

    totem.runtimeState = 'running';
    totem.uptime = 0;
    this.notifyListeners();
  }

  /**
   * Simulate stopping program execution
   */
  simulateStop(totemId: string): void {
    const totem = this.demoTotems.find(t => t.id === totemId);
    if (!totem) return;

    totem.runtimeState = 'stopped';
    this.notifyListeners();
  }

  /**
   * Clear faults
   */
  clearFaults(totemId: string): void {
    const totem = this.demoTotems.find(t => t.id === totemId);
    if (!totem) return;

    totem.softwareFault = 'none';
    totem.hardwareFault = 'none';
    totem.faultDetails = undefined;
    totem.faultTimestamp = undefined;
    totem.runtimeState = 'idle';
    this.notifyListeners();
  }

  private createMockTotems(): TotemStatus[] {
    return [
      {
        id: 'demo-mcu-001',
        position: 0,
        type: 'mcu-controller',
        name: 'Main Controller',
        serialNumber: 'MCU-4A2B',
        connected: true,
        busAddress: 0x10,
        powerState: 'powered',
        voltage: 3.32,
        current: 125,
        programmingState: 'programmed',
        firmwareVersion: 'v2.1.0',
        lastProgrammed: new Date(Date.now() - 3600000),
        runtimeState: 'running',
        uptime: 3600,
        softwareFault: 'none',
        hardwareFault: 'none',
        capabilities: {
          hasADC: true,
          hasPWM: true,
          hasUART: true,
          hasI2C: true,
          gpioCount: 16
        }
      },
      {
        id: 'demo-temp-001',
        position: 1,
        type: 'sensor-temp',
        name: 'Temperature Sensor',
        serialNumber: 'TEMP-8C1D',
        connected: true,
        busAddress: 0x48,
        powerState: 'powered',
        voltage: 3.29,
        current: 15,
        programmingState: 'programmed',
        firmwareVersion: 'v1.5.2',
        lastProgrammed: new Date(Date.now() - 7200000),
        runtimeState: 'running',
        uptime: 7200,
        softwareFault: 'none',
        hardwareFault: 'none',
        capabilities: {
          hasADC: true,
          hasPWM: false,
          hasUART: false,
          hasI2C: true,
          gpioCount: 4
        }
      },
      {
        id: 'demo-pwm-001',
        position: 2,
        type: 'actuator-pwm',
        name: 'PWM Motor Driver',
        serialNumber: 'PWM-3F9A',
        connected: true,
        busAddress: 0x20,
        powerState: 'powered',
        voltage: 12.05,
        current: 340,
        programmingState: 'programmed',
        firmwareVersion: 'v1.8.0',
        lastProgrammed: new Date(Date.now() - 86400000),
        runtimeState: 'running',
        uptime: 86400,
        softwareFault: 'none',
        hardwareFault: 'none',
        capabilities: {
          hasADC: true,
          hasPWM: true,
          hasUART: true,
          hasI2C: true,
          gpioCount: 8
        }
      },
      {
        id: 'demo-mppt-001',
        position: 3,
        type: 'power-mppt',
        name: 'MPPT Controller',
        serialNumber: 'MPPT-7E2C',
        connected: true,
        busAddress: 0x30,
        powerState: 'powered',
        voltage: 24.12,
        current: 1250,
        programmingState: 'programmed',
        firmwareVersion: 'v3.0.1',
        lastProgrammed: new Date(Date.now() - 172800000),
        runtimeState: 'running',
        uptime: 172800,
        softwareFault: 'none',
        hardwareFault: 'none',
        capabilities: {
          hasADC: true,
          hasPWM: true,
          hasUART: true,
          hasI2C: true,
          gpioCount: 12
        }
      },
      {
        id: 'demo-unprogrammed',
        position: 4,
        type: 'comm-uart',
        name: 'UART Module',
        serialNumber: 'UART-9B4F',
        connected: true,
        busAddress: 0x50,
        powerState: 'powered',
        voltage: 3.31,
        current: 8,
        programmingState: 'not-programmed',
        runtimeState: 'idle',
        softwareFault: 'none',
        hardwareFault: 'none',
        capabilities: {
          hasADC: false,
          hasPWM: false,
          hasUART: true,
          hasI2C: true,
          gpioCount: 2
        }
      }
    ];
  }

  private simulateRuntimeUpdates(): void {
    this.demoTotems.forEach(totem => {
      if (totem.runtimeState === 'running') {
        // Increment uptime
        if (totem.uptime !== undefined) {
          totem.uptime += 2;
        }

        // Simulate voltage fluctuations
        if (totem.voltage !== undefined) {
          totem.voltage += (Math.random() - 0.5) * 0.1;
          totem.voltage = Math.max(0, Math.min(totem.voltage, 25));
        }

        // Simulate current fluctuations
        if (totem.current !== undefined) {
          totem.current += (Math.random() - 0.5) * 10;
          totem.current = Math.max(0, totem.current);
        }

        // Randomly simulate a fault (1% chance)
        if (Math.random() < 0.01) {
          const faultTypes = ['software', 'hardware'] as const;
          const faultType = faultTypes[Math.floor(Math.random() * 2)];
          
          if (faultType === 'software') {
            const faults: SoftwareFault[] = ['watchdog-timeout', 'stack-overflow', 'assertion-failed'];
            totem.softwareFault = faults[Math.floor(Math.random() * faults.length)];
            totem.faultDetails = `Software fault detected during operation`;
          } else {
            const faults: HardwareFault[] = ['overtemperature', 'overcurrent'];
            totem.hardwareFault = faults[Math.floor(Math.random() * faults.length)];
            totem.faultDetails = `Hardware fault: ${totem.hardwareFault}`;
          }
          
          totem.runtimeState = 'fault';
          totem.faultTimestamp = new Date();
        }
      }
    });
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => {
      try {
        callback([...this.demoTotems]);
      } catch (error) {
        console.error('Demo listener error:', error);
      }
    });
  }
}

export const demoModeService = new DemoModeService();
export default demoModeService;