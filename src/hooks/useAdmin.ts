// src/hooks/useAdmin.ts
// Reads the current user's admin status from the user_profiles table.
// Also exposes helpers for the admin panel: list all users, read their settings.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id:         string;
  email:      string | null;
  nickname:   string | null;
  is_admin:   boolean;
  created_at: string;
  updated_at: string;
}

export interface UserWithSettings extends UserProfile {
  settings: Record<string, unknown>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [loading,  setLoading]  = useState(true);

  // Check admin status whenever the logged-in user changes
  useEffect(() => {
    if (!user) { setIsAdmin(false); setLoading(false); return; }

    supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setIsAdmin(data?.is_admin ?? false);
        setLoading(false);
      });
  }, [user?.id]);

  // Ensure a profile row exists for the current user (idempotent upsert)
  const ensureProfile = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('user_profiles')
      .upsert(
        { id: user.id, email: user.email, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
  }, [user]);

  // Sync nickname to user_profiles whenever it changes in user_settings
  const syncNickname = useCallback(async (nickname: string) => {
    if (!user) return;
    await supabase
      .from('user_profiles')
      .upsert(
        { id: user.id, nickname, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
  }, [user]);

  // ── Admin-only helpers ────────────────────────────────────────────────────

  // Fetch all user profiles (admin only)
  const getAllUsers = useCallback(async (): Promise<UserProfile[]> => {
    if (!isAdmin) return [];
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('[useAdmin] getAllUsers:', error.message); return []; }
    return data ?? [];
  }, [isAdmin]);

  // Fetch settings for a specific user (admin only)
  const getUserSettings = useCallback(async (userId: string): Promise<Record<string, unknown>> => {
    if (!isAdmin) return {};
    const { data, error } = await supabase
      .from('user_settings')
      .select('key, value')
      .eq('id', userId);
    if (error) { console.error('[useAdmin] getUserSettings:', error.message); return {}; }
    return Object.fromEntries((data ?? []).map(row => [row.key, row.value]));
  }, [isAdmin]);

  // Fetch all users with their settings merged (admin only)
  const getAllUsersWithSettings = useCallback(async (): Promise<UserWithSettings[]> => {
    if (!isAdmin) return [];
    const users = await getAllUsers();
    const withSettings = await Promise.all(
      users.map(async u => ({
        ...u,
        settings: await getUserSettings(u.id),
      }))
    );
    return withSettings;
  }, [isAdmin, getAllUsers, getUserSettings]);

  // Grant or revoke admin for a user (admin only — modifying another user's row)
  const setUserAdmin = useCallback(async (userId: string, value: boolean): Promise<void> => {
    if (!isAdmin) return;
    await supabase
      .from('user_profiles')
      .update({ is_admin: value, updated_at: new Date().toISOString() })
      .eq('id', userId);
  }, [isAdmin]);

  return {
    isAdmin,
    loading,
    ensureProfile,
    syncNickname,
    getAllUsers,
    getUserSettings,
    getAllUsersWithSettings,
    setUserAdmin,
  };
}