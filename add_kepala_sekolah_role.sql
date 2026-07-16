-- Jalankan ini di Supabase SQL Editor (https://supabase.com/dashboard)
-- Untuk menambahkan role 'kepala_sekolah' dan 'piket' ke constraint profiles

-- 1. Drop constraint lama
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Buat constraint baru dengan semua role
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'kepala_sekolah', 'guru', 'siswa', 'piket'));
