'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const CFG_KEY = 'manito_v6_supabase';

type StoredConfig = {
  url: string;
  key: string;
};

let cachedClient: SupabaseClient | null = null;

export function getStoredConfig(): StoredConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    return raw ? (JSON.parse(raw) as StoredConfig) : null;
  } catch {
    return null;
  }
}

export function saveStoredConfig(config: StoredConfig) {
  window.localStorage.setItem(CFG_KEY, JSON.stringify(config));
  cachedClient = null;
}

export function clearStoredConfig() {
  window.localStorage.removeItem(CFG_KEY);
  cachedClient = null;
}

export function isV6SupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ) || Boolean(getStoredConfig());
}

export function getV6Supabase() {
  if (cachedClient) return cachedClient;

  const stored = getStoredConfig();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || stored?.url;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || stored?.key;

  if (!url || !key) {
    throw new Error('Falta configurar Supabase.');
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return cachedClient;
}
