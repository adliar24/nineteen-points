-- Database Indexing Optimization for NineTeen Space
-- Run this script in your Supabase SQL Editor to boost database search performance

-- Index for fast lookup on student point history
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_siswa_id ON public.riwayat_poin(siswa_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_created_at ON public.riwayat_poin(created_at DESC);

-- Index for fast attendance queries by date and student
CREATE INDEX IF NOT EXISTS idx_kehadiran_siswa_id ON public.kehadiran(siswa_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_tanggal ON public.kehadiran(tanggal);

-- Index for teacher teaching schedule queries
CREATE INDEX IF NOT EXISTS idx_jadwal_guru_teacher_id ON public.jadwal_guru(teacher_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_guru_hari ON public.jadwal_guru(hari);

-- Index for student NIS lookup
CREATE INDEX IF NOT EXISTS idx_siswa_nis ON public.siswa(nis);
CREATE INDEX IF NOT EXISTS idx_profiles_nis ON public.profiles(nis);
