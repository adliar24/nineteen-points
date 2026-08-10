import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase URL or Anon Key is missing. Sync features will not work until .env is configured.");
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const getSupabaseClient = (): SupabaseClient => {
  if (!supabase) {
    throw new Error('Konfigurasi Supabase belum diatur. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY terlebih dahulu.');
  }

  return supabase;
};

export const getSupabaseClientOrNull = (): SupabaseClient | null => {
  return supabase;
};
