-- =========================================================================
-- RESET PASSWORD SEMUA ROLE — SMAN 19 BANDUNG
--
-- Default Password:
--   Guru / Kepala Sekolah : guru19*
--   Murid                 : murid19*
--   Piket                 : piket19*
--
-- Jalankan di Supabase SQL Editor.
-- AMAN DIJALANKAN BERULANG KALI.
-- =========================================================================

-- 1. Reset password semua GURU
UPDATE auth.users
SET encrypted_password = crypt('guru19*', gen_salt('bf'))
WHERE id IN (
  SELECT id FROM public.profiles WHERE role = 'guru'
);

-- 2. Reset password semua KEPALA SEKOLAH
UPDATE auth.users
SET encrypted_password = crypt('kepsek19*', gen_salt('bf'))
WHERE id IN (
  SELECT id FROM public.profiles WHERE role = 'kepala_sekolah'
);

-- 3. Reset password semua MURID
UPDATE auth.users
SET encrypted_password = crypt('murid19*', gen_salt('bf'))
WHERE id IN (
  SELECT id FROM public.profiles WHERE role = 'siswa'
);

-- 4. Reset password semua PIKET
UPDATE auth.users
SET encrypted_password = crypt('piket19*', gen_salt('bf'))
WHERE id IN (
  SELECT id FROM public.profiles WHERE role = 'piket'
);

-- =========================================================================
-- SELESAI! Semua password sudah di-reset.
-- =========================================================================
