-- =========================================================================
-- MIGRASI ABSENSI GURU BERDASARKAN JADWAL MENGAJAR (KBM)
-- Nineteen Space SMAN 19 Bandung
-- =========================================================================

-- 1. Bersihkan data kehadiran guru lama (karena strukturnya diubah total)
TRUNCATE TABLE public.kehadiran_guru CASCADE;

-- 2. Hapus unique constraint lama yang membatasi 1 guru hanya 1 absen per tanggal
ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_user_id_tanggal_key;

-- 3. Tambahkan kolom jadwal_id yang merujuk ke tabel jadwal_guru
ALTER TABLE public.kehadiran_guru ADD COLUMN IF NOT EXISTS jadwal_id UUID REFERENCES public.jadwal_guru(id) ON DELETE CASCADE;

-- 4. Tambahkan unique constraint baru: satu slot jadwal mengajar hanya boleh di-absen sekali per tanggal
ALTER TABLE public.kehadiran_guru ADD CONSTRAINT kehadiran_guru_jadwal_id_tanggal_key UNIQUE (jadwal_id, tanggal);
