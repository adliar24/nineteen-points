-- =========================================================================
-- RESET SEMUA DATA SISWA — SMAN 19 BANDUNG
-- Hapus: foto, riwayat poin, data siswa, profil akun
-- =========================================================================
-- ⚠️ PASTIKAN KAMU SUDAH LOGIN SEBAGAI SUPER_ADMIN SEJALANKAN SCRIPT INI
-- =========================================================================

-- ⚠️ STEP 0: HAPUS FOTO DARI STORAGE (tidak bisa dari SQL!)
-- Buka Supabase Dashboard → Storage → profile-photos → Centang semua → Hapus

-- 2. HAPUS SEMUA RIWAYAT POIN SISWA
DELETE FROM public.riwayat_poin;

-- 3. HAPUS SEMUA PROFIL AKUN SISWA (role = 'siswa')
DELETE FROM public.profiles WHERE role = 'siswa';

-- 4. HAPUS SEMUA DATA SISWA
DELETE FROM public.siswa;

-- 5. RESET MASTER POIN (hapus lama, insert ulang yang benar)
DELETE FROM public.master_poin;

INSERT INTO public.master_poin (nama_poin, nilai_poin) VALUES
('Juara Umum Lomba Nasional (Akademik/Non-Akademik)', 100),
('Juara Tingkat Provinsi / Kota', 50),
('Sikap Terpuji & Membantu Guru (KBM)', 15),
('Merapikan & Menjaga Kebersihan Kelas', 10),
('Mengumpulkan Tugas Tepat Waktu', 5),
('Terlambat Masuk Sekolah (>15 Menit)', -15),
('Membuang Sampah Sembarangan', -10),
('Atribut Seragam Tidak Lengkap', -10),
('Membuat Kegaduhan di Kelas', -15),
('Bolos Jam Pelajaran', -25);

-- =========================================================================
-- SELESAI — Sekarang hapus auth users dari Dashboard Supabase:
-- =========================================================================
-- 1. Buka Supabase Dashboard → Authentication → Users
-- 2. Centang semua user yang emailnya @sman19.sch.id (kecuali akun admin kamu)
-- 3. Klik "Delete users"
-- =========================================================================
