// src/services/virtualSerialSimulator.ts
// Virtual Serial Port Simulator for testing without Nucleo hardware
// This simulates the FreeRTOS CLI responses

export class VirtualSerialSimulator {
  private isRunning: boolean = false;
  private ledState: boolean = false;
  private pidValues = { Kp: 1.0, Ki: 0.0, Kd: 0.0, Mode: 1 };
  private onDataCallback: ((data: string) => void) | null = null;
  private inputBuffer: string = '';

  // Simulated response delay (ms)
  private responseDelay: number = 50;

  start(onData: (data: string) => void) {
    this.isRunning = true;
    this.onDataCallback = onData;
    console.log('[VirtualSerial] Simulator started');
    
    // Send welcome message
    setTimeout(() => {
      this.sendResponse('\r\nFreeRTOS CLI (Virtual)\r\nType "help" for commands\r\n> ');
    }, 100);
  }

  stop() {
    this.isRunning = false;
    this.onDataCallback = null;
    this.inputBuffer = '';
    console.log('[VirtualSerial] Simulator stopped');
  }

  // Simulate receiving data from the "host" (what the user types)
  write(data: string) {
    if (!this.isRunning) return;

    // Process character by character (like real UART)
    for (const char of data) {
      this.processChar(char);
    }
  }

  private processChar(char: string) {
    // Echo the character back (like real terminal)
    // this.sendResponse(char);

    if (char === '\r' || char === '\n') {
      // Command complete, process it
      const command = this.inputBuffer.trim();
      this.inputBuffer = '';
      
      if (command.length > 0) {
        this.processCommand(command);
      }
    } else {
      this.inputBuffer += char;
    }
  }

  private processCommand(command: string) {
    console.log(`[VirtualSerial] Processing command: "${command}"`);
    
    const parts = command.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    setTimeout(() => {
      let response = '';

      switch (cmd) {
        case 'hello':
          response = 'Hello, World!\r\n';
          break;

        case 'toggle-led':
          this.ledState = !this.ledState;
          response = this.ledState ? 'LED Turned ON.\r\n' : 'LED Turned OFF.\r\n';
          break;

        case 'uart_send':
          if (args.length > 0) {
            const message = args.join(' ');
            response = `OK: Sent ${message.length + 1} bytes.\r\n`;
          } else {
            response = 'Error: Missing or empty string parameter.\r\n';
          }
          break;

        case 'echo_send':
          if (args.length > 0) {
            const str = args.join(' ');
            response = `OK.\r\n Sent : '${str}' (${str.length} bytes + \\n)\r\n Received: '${str}' (${str.length} bytes)\r\n`;
          } else {
            response = 'Error: Missing or empty string parameter.\r\n';
          }
          break;

        case 'set_pid':
          if (args.length >= 4) {
            this.pidValues.Kp = parseFloat(args[0]) || 0;
            this.pidValues.Ki = parseFloat(args[1]) || 0;
            this.pidValues.Kd = parseFloat(args[2]) || 0;
            this.pidValues.Mode = parseInt(args[3]) || 1;
            response = `ESP32 Response: 'OK'\r\n`;
          } else {
            response = 'Error: Expected 4 parameters.\r\n';
          }
          break;

        case 'get_pid':
          response = `ESP32 PID: Kp=${this.pidValues.Kp},Ki=${this.pidValues.Ki},Kd=${this.pidValues.Kd},Mode=${this.pidValues.Mode}\r\n`;
          break;

        case 'help':
          response = 'Available commands:\r\n' +
            '  hello        - Test command\r\n' +
            '  toggle-led   - Toggle LED\r\n' +
            '  uart_send    - Send via UART7\r\n' +
            '  echo_send    - Echo test\r\n' +
            '  set_pid      - Set PID values\r\n' +
            '  get_pid      - Get PID values\r\n';
          break;

        default:
          response = `Command not recognized: '${cmd}'\r\nType 'help' for available commands.\r\n`;
      }

      this.sendResponse(response);
    }, this.responseDelay);
  }

  private sendResponse(data: string) {
    if (this.onDataCallback && this.isRunning) {
      this.onDataCallback(data);
    }
  }
}

// Singleton instance
export const virtualSerial = new VirtualSerialSimulator();
export default virtualSerial;