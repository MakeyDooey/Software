// src/types/totem.ts

// Totem hardware identification
export type TotemType = 
  | 'mcu-controller'    // Main microcontroller board
  | 'sensor-temp'       // Temperature sensor module
  | 'sensor-voltage'    // Voltage/current sensor
  | 'actuator-pwm'      // PWM output module
  | 'actuator-relay'    // Relay control module
  | 'comm-uart'         // UART communication module
  | 'comm-i2c'          // I2C bus module
  | 'power-mppt'        // MPPT controller
  | 'unknown';          // Unidentified totem

// Totem power states
export type PowerState = 
  | 'powered'           // Receiving power from PSU
  | 'unpowered'         // Not connected to power
  | 'low-voltage'       // Power below threshold
  | 'overvoltage';      // Power above safe threshold

// Totem programming states
export type ProgrammingState = 
  | 'not-programmed'    // No firmware loaded
  | 'programming'       // Currently flashing firmware
  | 'programmed'        // Successfully programmed
  | 'failed';           // Programming failed

// Totem runtime states
export type RuntimeState = 
  | 'idle'              // Programmed but not running
  | 'running'           // Executing program normally
  | 'paused'            // Execution paused
  | 'stopped'           // Execution stopped
  | 'fault';            // Runtime error detected

// Software fault types
export type SoftwareFault = 
  | 'stack-overflow'    // Stack memory exceeded
  | 'watchdog-timeout'  // Watchdog timer expired
  | 'assertion-failed'  // Code assertion triggered
  | 'rtos-error'        // RTOS scheduling error
  | 'memory-leak'       // Heap allocation failure
  | 'infinite-loop'     // Detected stuck in loop
  | 'comm-timeout'      // Communication timeout
  | 'none';             // No software fault

// Hardware fault types
export type HardwareFault = 
  | 'overcurrent'       // Current draw too high
  | 'overtemperature'   // Temperature above limit
  | 'sensor-disconnected' // Sensor not responding
  | 'bus-error'         // Communication bus fault
  | 'eeprom-failure'    // Non-volatile memory error
  | 'clock-failure'     // External clock issue
  | 'brownout'          // Power supply unstable
  | 'none';             // No hardware fault

// Complete totem status
export interface TotemStatus {
  id: string;                           // Unique identifier (e.g., "totem-0x4A2B")
  position: number;                     // Position in totem pole (0 = bottom)
  type: TotemType;                      // Hardware type
  name: string;                         // User-friendly name
  serialNumber: string;                 // Hardware serial number
  
  // Connection info
  connected: boolean;                   // Currently detected on bus
  usbPort?: string;                     // USB port if directly connected
  busAddress: number;                   // I2C/SPI address on totem bus
  
  // Power status
  powerState: PowerState;
  voltage?: number;                     // Current voltage (V)
  current?: number;                     // Current draw (mA)
  
  // Programming status
  programmingState: ProgrammingState;
  firmwareVersion?: string;             // Loaded firmware version
  lastProgrammed?: Date;                // Timestamp of last flash
  
  // Runtime status
  runtimeState: RuntimeState;
  uptime?: number;                      // Seconds since start
  
  // Fault status
  softwareFault: SoftwareFault;
  hardwareFault: HardwareFault;
  faultDetails?: string;                // Additional fault information
  faultTimestamp?: Date;                // When fault occurred
  
  // Hardware capabilities
  capabilities: {
    hasADC: boolean;
    hasPWM: boolean;
    hasUART: boolean;
    hasI2C: boolean;
    gpioCount: number;
  };
}

// Totem pole configuration (ordered list)
export interface TotemPoleConfig {
  totems: TotemStatus[];                // Ordered from bottom to top
  autoDetect: boolean;                  // Enable USB auto-detection
  usbVendorId?: string;                 // USB VID for detection
  usbProductId?: string;                // USB PID for detection
}

// USB connection event
export interface USBConnectionEvent {
  action: 'connected' | 'disconnected';
  totem: TotemStatus;
  timestamp: Date;
}

// Programming request
export interface ProgrammingRequest {
  totemId: string;
  firmwareFile: File | string;          // Hex/bin file
  verifyAfterFlash: boolean;
  autoStart: boolean;                   // Start execution after flash
}

// Programming response
export interface ProgrammingResponse {
  success: boolean;
  totemId: string;
  message: string;
  duration?: number;                    // Programming time (ms)
  error?: string;
}