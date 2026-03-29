// src/services/platform/WebPlatformService.ts
// Web platform service — uses Web Serial API for hardware communication
// and a Supabase-backed storage layer (with localStorage fallback).

import type { IPlatformService, SerialDevice } from '../../types/platform';
import { supabase } from '../supabaseClient';

export class WebPlatformService implements IPlatformService {

  // ── Platform detection ────────────────────────────────────────────────────

  isElectron(): boolean { return false; }
  isWeb():      boolean { return true; }
  getPlatform(): 'web'  { return 'web'; }

  // ── Serial — listing is the only responsibility here.
  // Port opening / data streaming is handled directly in TotemProgrammingIDE. ──

  async listSerialDevices(): Promise<SerialDevice[]> {
    if (!('serial' in navigator)) {
      console.warn('[WebPlatform] Web Serial API not supported in this browser.');
      return [];
    }
    try {
      const ports = await (navigator as any).serial.getPorts();
      return ports.map((port: any, index: number) => {
        const info      = port.getInfo();
        const vendorId  = info?.usbVendorId?.toString(16).padStart(4, '0');
        const productId = info?.usbProductId?.toString(16).padStart(4, '0');
        const id        = `port-${vendorId ?? 'xxxx'}-${productId ?? 'xxxx'}-${index}`;
        let name = `Serial Device ${index}`;
        if (vendorId === '0483') name = 'STMicroelectronics Device';
        if (vendorId === '303a' || vendorId === '10c4' || vendorId === '1a86') name = 'ESP32 Device';
        return { id, name, vendorId, productId };
      });
    } catch (err) {
      console.error('[WebPlatform] listSerialDevices:', err);
      return [];
    }
  }

  // Not used — handled in TotemProgrammingIDE
  async openSerialPort(_deviceId: string, _baudRate: number): Promise<void> {}
  async closeSerialPort(_deviceId: string): Promise<void> {}
  async writeSerial(_deviceId: string, _data: string): Promise<void> {}
  onSerialData(_deviceId: string, _cb: (data: string) => void): void {}
  removeSerialDataListener(_deviceId: string): void {}

  // ── Storage (Supabase + localStorage fallback) ────────────────────────────
  //
  // Pattern:
  //   1. Always write to localStorage so the app is usable offline / while
  //      the user is not signed in.
  //   2. If a Supabase session exists, also upsert to the cloud table so
  //      settings follow the user across devices.

  async setItem(key: string, value: unknown): Promise<void> {
    // --- Local ---
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage quota / incognito */ }

    // --- Cloud ---
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('user_settings')
      .upsert(
        { id: user.id, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'id,key' }
      );
    if (error) console.error('[WebPlatform] setItem cloud error:', error.message);
  }

  async getItem(key: string): Promise<unknown> {
    // --- Cloud first ---
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('user_settings')
        .select('value')
        .eq('id', user.id)
        .eq('key', key)
        .single();
      if (!error && data) return data.value;
    }

    // --- Fallback: localStorage ---
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_settings')
      .delete()
      .eq('id', user.id)
      .eq('key', key);
  }

  async clear(): Promise<void> {
    localStorage.clear();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_settings')
      .delete()
      .eq('id', user.id);
  }

  // ── File helpers (download / upload in browser) ───────────────────────────

  async saveFile(filename: string, data: string): Promise<void> {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  async openFile(): Promise<string | null> {
    return new Promise(resolve => {
      const input   = document.createElement('input');
      input.type    = 'file';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target?.result as string ?? null);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }
}