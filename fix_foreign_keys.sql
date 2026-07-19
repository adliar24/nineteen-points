-- =========================================================================
-- PERBAIKAN RELASI FOREIGN KEY KE TABEL PROFILES (UNTUK SUPABASE JOIN)
-- Nineteen Space SMAN 19 Bandung
-- =========================================================================

-- 1. Perbarui relasi foreign key pada tabel jadwal_guru
ALTER TABLE public.jadwal_guru DROP CONSTRAINT IF EXISTS jadwal_guru_user_id_fkey;
ALTER TABLE public.jadwal_guru ADD CONSTRAINT jadwal_guru_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Perbarui relasi foreign key pada tabel kehadiran_guru
ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_user_id_fkey;
ALTER TABLE public.kehadiran_guru ADD CONSTRAINT kehadiran_guru_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. Perbarui relasi foreign key pada tabel kegiatan_guru
ALTER TABLE public.kegiatan_guru DROP CONSTRAINT IF EXISTS kegiatan_guru_user_id_fkey;
ALTER TABLE public.kegiatan_guru ADD CONSTRAINT kegiatan_guru_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
