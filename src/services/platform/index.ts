import type { IPlatformService, SerialDevice } from '../../types/platform';
import { WebPlatformService } from './WebPlatformService';
import { ElectronPlatformService } from './ElectronPlatformService';

// Auto-detect platform and return appropriate service
function createPlatformService(): IPlatformService {
  const isElectron = typeof window !== 'undefined' && 
                     (window as any).electronAPI?.isElectron === true;

  if (isElectron) {
    console.log('🖥️  Running in Electron');
    return new ElectronPlatformService();
  } else {
    console.log('🌐 Running in Web Browser');
    return new WebPlatformService();
  }
}

// Export singleton instance
export const platformService = createPlatformService();
export type { IPlatformService, SerialDevice };