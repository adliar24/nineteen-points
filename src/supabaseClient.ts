import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";

let supabaseInstance: any = null;
let supabaseAdminAuthInstance: any = null;
let envError = "";

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder") || supabaseUrl === "") {
  envError = "Kredensial Supabase (URL / Anon Key) belum diatur di file .env.local atau environment variables Anda.";
} else {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
    supabaseAdminAuthInstance = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (err: any) {
    envError = "Gagal menginisialisasi Supabase Client: " + err.message;
  }
}

export const supabase = supabaseInstance;
export const supabaseAdminAuth = supabaseAdminAuthInstance;
export const supabaseEnvError = envError;
