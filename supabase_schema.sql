-- =========================================================================
-- NINETEEN POINTS DATABASE SCHEMA (SMAN 19 BANDUNG)
-- AMAN DIJALANKAN BERULANG KALI — TIDAK MENGHAPUS DATA YANG SUDAH ADA
-- =========================================================================

-- 1. TABEL SISWA
CREATE TABLE IF NOT EXISTS public.siswa (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nis TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  kelas TEXT NOT NULL,
  total_poin INT DEFAULT 0 NOT NULL,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tambah kolom foto_url jika belum ada (untuk database yang sudah jalan)
ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS foto_url TEXT;

CREATE INDEX IF NOT EXISTS idx_siswa_nis ON public.siswa(nis);

-- 2. TABEL MASTER BOBOT POIN (ATURAN BAKU)
CREATE TABLE IF NOT EXISTS public.master_poin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_poin TEXT NOT NULL,
  nilai_poin INT NOT NULL
);

-- 3. TABEL RIWAYAT POIN SISWA (LOG AUDIT)
CREATE TABLE IF NOT EXISTS public.riwayat_poin (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  siswa_id UUID REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  nilai_diberikan INT NOT NULL,
  nama_poin TEXT NOT NULL,
  guru_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABEL PROFILES (HAK AKSES / ROLE-BASED ACCESS CONTROL)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'kepala_sekolah', 'guru', 'siswa', 'piket')),
  nis TEXT REFERENCES public.siswa(nis) ON DELETE SET NULL,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tambah kolom foto_url jika belum ada (untuk database yang sudah jalan)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- =========================================================================
-- TRIGGER 1: OTOMATIS MEMBUAT PROFIL SAAT PENGGUNA BARU MENDAFTAR (AUTH)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nama, role, nis)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'fullName', 'Pengguna Baru'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'siswa'),
    NEW.raw_user_meta_data->>'nis'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger lama jika ada, lalu buat ulang
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================================
-- TRIGGER 2: OTOMATISASI KALKULASI POIN SISWA (INTEGRITAS DATA)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.update_total_poin_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.siswa
  SET total_poin = total_poin + NEW.nilai_diberikan
  WHERE id = NEW.siswa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_riwayat_poin_insert ON public.riwayat_poin;
CREATE TRIGGER trg_riwayat_poin_insert
  AFTER INSERT ON public.riwayat_poin
  FOR EACH ROW EXECUTE FUNCTION public.update_total_poin_on_insert();

CREATE OR REPLACE FUNCTION public.update_total_poin_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.siswa
  SET total_poin = total_poin - OLD.nilai_diberikan
  WHERE id = OLD.siswa_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_riwayat_poin_delete ON public.riwayat_poin;
CREATE TRIGGER trg_riwayat_poin_delete
  AFTER DELETE ON public.riwayat_poin
  FOR EACH ROW EXECUTE FUNCTION public.update_total_poin_on_delete();

-- =========================================================================
-- SEEDING DATA AWAL: ATURAN MASTER POIN BAKU SMAN 19 BANDUNG
-- Hanya insert jika belum ada (ON CONFLICT DO NOTHING)
-- =========================================================================
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
('Bolos Jam Pelajaran', -25)
ON CONFLICT DO NOTHING;

-- =========================================================================
-- KEAMANAN: ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================
ALTER TABLE public.siswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_poin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_poin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop policies lama jika ada, lalu buat ulang
DROP POLICY IF EXISTS "Akses baca profil terautentikasi" ON public.profiles;
DROP POLICY IF EXISTS "Akses penuh profil ke service role" ON public.profiles;
DROP POLICY IF EXISTS "Akses baca siswa oleh semua user terautentikasi" ON public.siswa;
DROP POLICY IF EXISTS "Akses penuh siswa oleh guru dan admin" ON public.siswa;
DROP POLICY IF EXISTS "Akses penuh master_poin oleh semua user terautentikasi" ON public.master_poin;
DROP POLICY IF EXISTS "Akses baca riwayat oleh semua user terautentikasi" ON public.riwayat_poin;
DROP POLICY IF EXISTS "Akses penuh riwayat oleh guru dan admin" ON public.riwayat_poin;

CREATE POLICY "Akses baca profil terautentikasi" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses penuh profil ke service role" ON public.profiles FOR ALL TO service_role USING (true);
CREATE POLICY "Akses penuh profil oleh admin" ON public.profiles FOR ALL TO authenticated USING (true);
CREATE POLICY "Akses baca siswa oleh semua user terautentikasi" ON public.siswa FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses penuh siswa oleh guru dan admin" ON public.siswa FOR ALL TO authenticated USING (true);
CREATE POLICY "Akses penuh master_poin oleh semua user terautentikasi" ON public.master_poin FOR ALL TO authenticated USING (true);
CREATE POLICY "Akses baca riwayat oleh semua user terautentikasi" ON public.riwayat_poin FOR SELECT TO authenticated USING (true);
CREATE POLICY "Akses penuh riwayat oleh guru dan admin" ON public.riwayat_poin FOR ALL TO authenticated USING (true);

-- Storage bucket untuk foto profil (jalankan sekali saja)
-- Jika bucket sudah ada, abaikan error
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('profile-photos', 'profile-photos', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']);
EXCEPTION WHEN unique_violation THEN
  NULL; -- Bucket sudah ada, skip
END $$;

-- Storage RLS policies
DROP POLICY IF EXISTS "Public access untuk foto profil" ON storage.objects;
DROP POLICY IF EXISTS "Upload foto profil oleh user terautentikasi" ON storage.objects;
DROP POLICY IF EXISTS "Update foto profil oleh user terautentikasi" ON storage.objects;
DROP POLICY IF EXISTS "Delete foto profil oleh user terautentikasi" ON storage.objects;

CREATE POLICY "Public access untuk foto profil"
  ON storage.objects FOR SELECT
  TO public USING (bucket_id = 'profile-photos');

CREATE POLICY "Upload foto profil oleh user terautentikasi"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "Update foto profil oleh user terautentikasi"
  ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'profile-photos');

CREATE POLICY "Delete foto profil oleh user terautentikasi"
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'profile-photos');
