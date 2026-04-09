declare module 'esptool-js' {
  export class Transport {
    constructor(port: any);
    disconnect?: () => Promise<void>;
  }

  export class ESPLoader {
    chip: any;
    constructor(options: any);
    main: () => Promise<any>;
    writeFlash?: (options: any) => Promise<void>;
  }
}
