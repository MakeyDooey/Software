// src/services/virtualSerialSimulator.ts
// Virtual Serial Port Simulator for testing without hardware
// Simulates FreeRTOS CLI responses AND Roxanne ESP32 motor commands

export class VirtualSerialSimulator {
  private isRunning: boolean = false;
  private ledState: boolean = false;
  private pidValues = { Kp: 1.0, Ki: 0.0, Kd: 0.0, Mode: 1 };
  private onDataCallback: ((data: string) => void) | null = null;
  private inputBuffer: string = '';

  // Roxanne motor state (mirrors firmware)
  private activeMotors: boolean[] = [false, false, false];
  private dcSpeeds: number[] = [0, 0];
  private activeMotorType: 'none' | 'stepper' | 'dc' = 'none';

  private responseDelay: number = 50;

  start(onData: (data: string) => void) {
    this.isRunning = true;
    this.onDataCallback = onData;
    console.log('[VirtualSerial] Simulator started');
    setTimeout(() => {
      this.sendResponse('\r\nMakeyDooey Virtual Terminal\r\nType "help" for commands\r\n> ');
    }, 100);
  }

  stop() {
    this.isRunning = false;
    this.onDataCallback = null;
    this.inputBuffer = '';
    this.activeMotors = [false, false, false];
    this.dcSpeeds = [0, 0];
    this.activeMotorType = 'none';
    console.log('[VirtualSerial] Simulator stopped');
  }

  write(data: string) {
    if (!this.isRunning) return;
    for (const char of data) {
      this.processChar(char);
    }
  }

  private processChar(char: string) {
    if (char === '\r' || char === '\n') {
      const command = this.inputBuffer.trim();
      this.inputBuffer = '';
      if (command.length > 0) {
        this.processCommand(command);
      }
    } else {
      this.inputBuffer += char;
    }
  }

  private updateMotorType() {
    const anyStep = this.activeMotors.some(Boolean);
    const anyDC = this.dcSpeeds.some(s => s !== 0);
    if (anyStep) this.activeMotorType = 'stepper';
    else if (anyDC) this.activeMotorType = 'dc';
    else this.activeMotorType = 'none';
  }

  private processCommand(command: string) {
    console.log(`[VirtualSerial] Command: "${command}"`);
    const parts = command.split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);

    setTimeout(() => {
      let response = '';

      // ── Nucleo / general commands ──────────────────────────────────────────
      if (cmd.toLowerCase() === 'hello') {
        response = 'Hello, World!\r\n';

      } else if (cmd.toLowerCase() === 'toggle-led') {
        this.ledState = !this.ledState;
        response = this.ledState ? 'LED Turned ON.\r\n' : 'LED Turned OFF.\r\n';

      } else if (cmd.toLowerCase() === 'uart_send') {
        if (args.length > 0) {
          const message = args.join(' ');
          response = `OK: Sent ${message.length + 1} bytes.\r\n`;
        } else {
          response = 'Error: Missing or empty string parameter.\r\n';
        }

      } else if (cmd.toLowerCase() === 'echo_send') {
        if (args.length > 0) {
          const str = args.join(' ');
          response = `OK.\r\n Sent : '${str}' (${str.length} bytes + \\n)\r\n Received: '${str}' (${str.length} bytes)\r\n`;
        } else {
          response = 'Error: Missing or empty string parameter.\r\n';
        }

      } else if (cmd.toLowerCase() === 'set_pid') {
        if (args.length >= 4) {
          this.pidValues.Kp = parseFloat(args[0]) || 0;
          this.pidValues.Ki = parseFloat(args[1]) || 0;
          this.pidValues.Kd = parseFloat(args[2]) || 0;
          this.pidValues.Mode = parseInt(args[3]) || 1;
          response = `ESP32 Response: 'OK'\r\n`;
        } else {
          response = 'Error: Expected 4 parameters.\r\n';
        }

      } else if (cmd.toLowerCase() === 'get_pid') {
        response = `ESP32 PID: Kp=${this.pidValues.Kp},Ki=${this.pidValues.Ki},Kd=${this.pidValues.Kd},Mode=${this.pidValues.Mode}\r\n`;

      } else if (cmd.toLowerCase() === 'help') {
        response =
          'Nucleo commands:\r\n' +
          '  hello        - Test connection\r\n' +
          '  toggle-led   - Toggle LED\r\n' +
          '  uart_send    - Send via UART7\r\n' +
          '  echo_send    - Echo test\r\n' +
          '  set_pid      - Set PID values\r\n' +
          '  get_pid      - Get PID values\r\n' +
          '\r\nRoxanne motor commands:\r\n' +
          '  STOP                  - Emergency stop all\r\n' +
          '  STATUS                - Motor status\r\n' +
          '  CALIBRATE             - Run calibration\r\n' +
          '  START:<id>:<CW|CCW>   - Run stepper (0-2)\r\n' +
          '  STOP_STEPPER:<id>     - Stop stepper\r\n' +
          '  DC:<id>:<speed>       - Drive DC motor (0-1, -255 to 255)\r\n' +
          '  DC_STOP:<id>          - Stop DC motor\r\n' +
          '  OPEN_HAND             - Open hand preset\r\n' +
          '  CLOSE_HAND            - Close hand preset\r\n';

      // ── Roxanne motor commands ─────────────────────────────────────────────
      } else if (cmd === 'STOP') {
        this.activeMotors = [false, false, false];
        this.dcSpeeds = [0, 0];
        this.activeMotorType = 'none';
        response = 'OK:ALL_STOP\r\n';

      } else if (cmd === 'STATUS') {
        let s = '';
        for (let i = 0; i < 3; i++) {
          s += `stepper ${i} active=${this.activeMotors[i]}\r\n`;
        }
        for (let i = 0; i < 2; i++) {
          s += `dc ${i} speed=${this.dcSpeeds[i]}\r\n`;
        }
        s += `enc0=0 enc1=0\r\n`;
        s += `active_type=${this.activeMotorType}\r\n`;
        response = s;

      } else if (cmd === 'CALIBRATE') {
        this.activeMotors = [false, false, false];
        this.dcSpeeds = [0, 0];
        this.activeMotorType = 'none';
        response = 'Calibrating...\r\nCALIBRATION:COMPLETE\r\n';

      } else if (cmd.startsWith('START:')) {
        if (this.activeMotorType === 'dc') {
          response = 'ERR dc active, send STOP first\r\n';
        } else {
          const parts2 = cmd.split(':');
          const id = parseInt(parts2[1]);
          const dir = parts2[2];
          if (id >= 0 && id < 3 && (dir === 'CW' || dir === 'CCW')) {
            this.activeMotors[id] = true;
            this.updateMotorType();
            response = `OK stepper=${id} dir=${dir}\r\n`;
          } else {
            response = 'ERR invalid stepper id or direction\r\n';
          }
        }

      } else if (cmd.startsWith('STOP_STEPPER:')) {
        const id = parseInt(cmd.split(':')[1]);
        if (id >= 0 && id < 3) {
          this.activeMotors[id] = false;
          this.updateMotorType();
          response = `OK stepper=${id} stopped\r\n`;
        } else {
          response = 'ERR invalid stepper id\r\n';
        }

      } else if (cmd.startsWith('DC:')) {
        if (this.activeMotorType === 'stepper') {
          response = 'ERR stepper active, send STOP first\r\n';
        } else {
          const parts2 = cmd.split(':');
          const id = parseInt(parts2[1]);
          const speed = parseInt(parts2[2]);
          if (id === 0 || id === 1) {
            this.dcSpeeds[id] = Math.max(-255, Math.min(255, speed));
            this.updateMotorType();
            response = `OK dc=${id} speed=${this.dcSpeeds[id]}\r\n`;
          } else {
            response = 'ERR invalid dc id\r\n';
          }
        }

      } else if (cmd.startsWith('DC_STOP:')) {
        const id = parseInt(cmd.split(':')[1]);
        if (id === 0 || id === 1) {
          this.dcSpeeds[id] = 0;
          this.updateMotorType();
          response = `OK dc=${id} stopped\r\n`;
        } else {
          response = 'ERR invalid dc id\r\n';
        }

      } else if (cmd === 'OPEN_HAND') {
        this.activeMotors = [false, false, false];
        this.dcSpeeds = [0, 0];
        this.activeMotorType = 'none';
        // Simulate staggered sequence
        response =
          'OK stepper=0 dir=CW\r\nOK stepper=1 dir=CW\r\nOK stepper=2 dir=CW\r\n' +
          'OK dc=0 speed=15\r\nOK dc=1 speed=15\r\nOK:OPEN_HAND\r\n';
        // Update state
        this.activeMotors = [false, false, false]; // steppers done after preset
        this.dcSpeeds = [15, 15];
        this.updateMotorType();

      } else if (cmd === 'CLOSE_HAND') {
        this.activeMotors = [false, false, false];
        this.dcSpeeds = [0, 0];
        this.activeMotorType = 'none';
        response =
          'OK stepper=0 dir=CCW\r\nOK stepper=1 dir=CCW\r\nOK stepper=2 dir=CCW\r\n' +
          'OK dc=0 speed=-15\r\nOK dc=1 speed=-15\r\nOK:CLOSE_HAND\r\n';
        this.activeMotors = [false, false, false];
        this.dcSpeeds = [-15, -15];
        this.updateMotorType();

      } else {
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

export const virtualSerial = new VirtualSerialSimulator();
export default virtualSerial;