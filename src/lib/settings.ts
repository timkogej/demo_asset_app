import { supabase } from './supabase';
import type { Settings } from '../types';

let cachedSettings: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (cachedSettings) return cachedSettings;
  const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
  cachedSettings = data;
  return data;
}

export function clearSettingsCache() {
  cachedSettings = null;
}
