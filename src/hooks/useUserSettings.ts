// src/hooks/useUserSettings.ts
// Hook to read/write per-user settings from the `user_settings` Supabase table.
// Falls back to localStorage when the user is not logged in (guest mode).

import { useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

export type SettingKey =
  | 'theme'
  | 'baudRate'
  | 'nickname'
  | 'lastConnectedDevice'
  | 'totemPoleConfig'
  | 'pidSettings'
  | 'flashHistory';

export interface TotemPoleSnapshot {
  id:           string;
  position:     number;
  type:         string;
  name:         string;
  serialNumber: string;
  busAddress:   number;
}

export interface FlashHistoryEntry {
  fileName:  string;
  deviceId:  string;
  timestamp: string;
  success:   boolean;
}

export function useUserSettings() {
  const { user } = useAuth();

  const setSetting = useCallback(async (key: SettingKey, value: unknown): Promise<void> => {
    try { localStorage.setItem(`md-${key}`, JSON.stringify(value)); } catch {}
    if (!user) return;
    const { error } = await supabase
      .from('user_settings')
      .upsert({ id: user.id, key, value, updated_at: new Date().toISOString() }, { onConflict: 'id,key' });
    if (error) console.error('[useUserSettings] setSetting error:', error.message);
  }, [user]);

  const getSetting = useCallback(async <T = unknown>(key: SettingKey): Promise<T | null> => {
    if (user) {
      const { data, error } = await supabase
        .from('user_settings').select('value').eq('id', user.id).eq('key', key).single();
      if (!error && data) return data.value as T;
    }
    try {
      const raw = localStorage.getItem(`md-${key}`);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  }, [user]);

  const removeSetting = useCallback(async (key: SettingKey): Promise<void> => {
    try { localStorage.removeItem(`md-${key}`); } catch {}
    if (!user) return;
    await supabase.from('user_settings').delete().eq('id', user.id).eq('key', key);
  }, [user]);

  const getAllSettings = useCallback(async (): Promise<Record<string, unknown>> => {
    if (!user) return {};
    const { data, error } = await supabase.from('user_settings').select('key, value').eq('id', user.id);
    if (error) { console.error('[useUserSettings] getAllSettings error:', error.message); return {}; }
    return Object.fromEntries((data ?? []).map(row => [row.key, row.value]));
  }, [user]);

  return { getSetting, setSetting, removeSetting, getAllSettings };
}