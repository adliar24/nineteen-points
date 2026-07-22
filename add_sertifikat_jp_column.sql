-- =========================================================================
-- MIGRASI FITUR SERTIFIKAT JP (KOLOM MATERI DETAIL JAM PELAJARAN)
-- Nineteen Space SMAN 19 Bandung
-- =========================================================================

-- Tambahkan kolom materi_jp bertipe JSONB ke tabel kegiatan_guru
ALTER TABLE public.kegiatan_guru ADD COLUMN IF NOT EXISTS materi_jp JSONB DEFAULT NULL;
