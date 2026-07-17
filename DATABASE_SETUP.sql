-- =========================================================================
-- NINETEEN POINTS — FULL DATABASE SETUP
-- SMAN 19 BANDUNG
--
-- AMAN DIJALANKAN BERULANG KALI (idempotent — IF NOT EXISTS / CREATE OR REPLACE)
-- Jalankan SELURUH isi file ini di Supabase SQL Editor SEKALI SAJA.
-- =========================================================================


-- =========================================================================
-- 1. TABEL
-- =========================================================================

-- 1a. TABEL SISWA
CREATE TABLE IF NOT EXISTS public.siswa (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nis        TEXT UNIQUE NOT NULL,
  nama       TEXT NOT NULL,
  kelas      TEXT NOT NULL,
  total_poin INT DEFAULT 0 NOT NULL,
  foto_url   TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Kolom tambahan (aman untuk DB yang sudah jalan)
ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- 1b. TABEL MASTER BOBOT POIN (ATURAN BAKU)
CREATE TABLE IF NOT EXISTS public.master_poin (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_poin  TEXT NOT NULL,
  nilai_poin INT NOT NULL
);

-- 1c. TABEL RIWAYAT POIN SISWA (LOG AUDIT)
CREATE TABLE IF NOT EXISTS public.riwayat_poin (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  siswa_id        UUID REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  nilai_diberikan INT NOT NULL,
  nama_poin       TEXT NOT NULL,
  guru_email      TEXT NOT NULL,
  semester        TEXT NOT NULL DEFAULT '2025/2026 Ganjil',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Kolom semester (aman untuk DB yang sudah jalan)
ALTER TABLE public.riwayat_poin ADD COLUMN IF NOT EXISTS semester TEXT NOT NULL DEFAULT '2025/2026 Ganjil';
ALTER TABLE public.riwayat_poin ADD COLUMN IF NOT EXISTS kehadiran_id UUID;

-- 1d. TABEL PROFILES (HAK AKSES / ROLE-BASED ACCESS CONTROL)
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  nama       TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('super_admin', 'kepala_sekolah', 'guru', 'siswa', 'piket')),
  nis        TEXT REFERENCES public.siswa(nis) ON DELETE SET NULL,
  foto_url   TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Kolom tambahan (aman untuk DB yang sudah jalan)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Constraint role — pastikan semua role terdaftar
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'kepala_sekolah', 'guru', 'siswa', 'piket'));

-- 1e. TABEL ATURAN KEHADIRAN
CREATE TABLE IF NOT EXISTS public.aturan_kehadiran (
  status       TEXT PRIMARY KEY CHECK (status IN ('tepat_waktu', 'telat_5', 'telat_10', 'telat_15', 'alfa')),
  label        TEXT NOT NULL,
  nilai_poin   INT NOT NULL
);

-- 1f. TABEL CATATAN KEHADIRAN
CREATE TABLE IF NOT EXISTS public.kehadiran (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  siswa_id             UUID REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  tanggal              DATE DEFAULT CURRENT_DATE NOT NULL,
  status               TEXT REFERENCES public.aturan_kehadiran(status) ON UPDATE CASCADE NOT NULL,
  nilai_poin_diberikan INT NOT NULL,
  pencatat_email       TEXT NOT NULL,
  created_at           TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (siswa_id, tanggal)
);

-- Hubungkan foreign key di riwayat_poin jika belum terhubung
ALTER TABLE public.riwayat_poin DROP CONSTRAINT IF EXISTS riwayat_poin_kehadiran_id_fkey;
ALTER TABLE public.riwayat_poin ADD CONSTRAINT riwayat_poin_kehadiran_id_fkey
  FOREIGN KEY (kehadiran_id) REFERENCES public.kehadiran(id) ON DELETE CASCADE;


-- =========================================================================
-- 2. INDEXES (PERFORMANCE)
-- =========================================================================

-- Siswa
CREATE INDEX IF NOT EXISTS idx_siswa_nis   ON public.siswa(nis);
CREATE INDEX IF NOT EXISTS idx_siswa_nama  ON public.siswa(nama);

-- Riwayat poin (query paling berat)
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_siswa_id   ON public.riwayat_poin(siswa_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_created_at ON public.riwayat_poin(created_at DESC);

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role  ON public.profiles(role);

-- Kehadiran
CREATE INDEX IF NOT EXISTS idx_kehadiran_siswa_id ON public.kehadiran(siswa_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_tanggal ON public.kehadiran(tanggal DESC);


-- =========================================================================
-- 3. TRIGGERS
-- =========================================================================

-- 3a. AUTO-CREATE PROFIL SAAT USER BARU DAFTAR (via Supabase Auth)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3b. AUTO-UPDATE total_poin SAAT RIWAYAT DITAMBAH
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

-- 3c. AUTO-UPDATE total_poin SAAT RIWAYAT DIHAPUS
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

-- 3d. AUTO-UPDATE total_poin SAAT RIWAYAT DIUBAH (UPDATE)
CREATE OR REPLACE FUNCTION public.update_total_poin_on_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.siswa
  SET total_poin = total_poin - OLD.nilai_diberikan + NEW.nilai_diberikan
  WHERE id = NEW.siswa_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_riwayat_poin_update ON public.riwayat_poin;
CREATE TRIGGER trg_riwayat_poin_update
  AFTER UPDATE ON public.riwayat_poin
  FOR EACH ROW EXECUTE FUNCTION public.update_total_poin_on_update();

-- 3e. AUTO-SYNC RIWAYAT POIN SAAT KEHADIRAN DITAMBAH (INSERT)
CREATE OR REPLACE FUNCTION public.sync_kehadiran_to_riwayat_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_label TEXT;
BEGIN
  SELECT label INTO v_label FROM public.aturan_kehadiran WHERE status = NEW.status;
  INSERT INTO public.riwayat_poin (siswa_id, nilai_diberikan, nama_poin, guru_email, kehadiran_id)
  VALUES (NEW.siswa_id, NEW.nilai_poin_diberikan, COALESCE(v_label, 'Pencatatan Kehadiran'), NEW.pencatat_email, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kehadiran_insert ON public.kehadiran;
CREATE TRIGGER trg_kehadiran_insert
  AFTER INSERT ON public.kehadiran
  FOR EACH ROW EXECUTE FUNCTION public.sync_kehadiran_to_riwayat_insert();

-- 3f. AUTO-SYNC RIWAYAT POIN SAAT KEHADIRAN DIUBAH (UPDATE)
CREATE OR REPLACE FUNCTION public.sync_kehadiran_to_riwayat_update()
RETURNS TRIGGER AS $$
DECLARE
  v_label TEXT;
BEGIN
  SELECT label INTO v_label FROM public.aturan_kehadiran WHERE status = NEW.status;
  UPDATE public.riwayat_poin
  SET nilai_diberikan = NEW.nilai_poin_diberikan,
      nama_poin = COALESCE(v_label, 'Pencatatan Kehadiran'),
      guru_email = NEW.pencatat_email
  WHERE kehadiran_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kehadiran_update ON public.kehadiran;
CREATE TRIGGER trg_kehadiran_update
  AFTER UPDATE ON public.kehadiran
  FOR EACH ROW EXECUTE FUNCTION public.sync_kehadiran_to_riwayat_update();


-- =========================================================================
-- 4. SEED DATA — ATURAN MASTER POIN BAKU SMAN 19 BANDUNG
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

-- 4b. SEED DATA — ATURAN KEHADIRAN DEFAULT SMAN 19 BANDUNG
INSERT INTO public.aturan_kehadiran (status, label, nilai_poin) VALUES
('tepat_waktu', 'Hadir Tepat Waktu', 15),
('telat_5',      'Terlambat 5 Menit', -5),
('telat_10',     'Terlambat 10 Menit', -10),
('telat_15',     'Terlambat 15 Menit', -15),
('alfa',         'Alfa / Tanpa Keterangan', -25)
ON CONFLICT (status) DO UPDATE
SET label = EXCLUDED.label, nilai_poin = EXCLUDED.nilai_poin;


-- =========================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =========================================================================

-- Aktifkan RLS untuk semua tabel
ALTER TABLE public.siswa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_poin      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_poin     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aturan_kehadiran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kehadiran        ENABLE ROW LEVEL SECURITY;

-- Hapus semua policies lama (agar bisa dijalankan ulang tanpa duplikat)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'siswa', 'master_poin', 'riwayat_poin', 'aturan_kehadiran', 'kehadiran')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- -----------------------------------------------
-- PROFILES
-- -----------------------------------------------
-- Baca: semua authenticated user
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

-- Insert: hanya super_admin
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Update: hanya super_admin
CREATE POLICY "profiles_update"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Delete: hanya super_admin
CREATE POLICY "profiles_delete"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- -----------------------------------------------
-- SISWA
-- -----------------------------------------------
-- Baca: semua authenticated user
CREATE POLICY "siswa_select"
  ON public.siswa FOR SELECT
  TO authenticated USING (true);

-- Insert: admin, guru, kepala_sekolah, piket
CREATE POLICY "siswa_insert"
  ON public.siswa FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')
    )
  );

-- Update: admin, guru, kepala_sekolah, piket
CREATE POLICY "siswa_update"
  ON public.siswa FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')
    )
  );

-- Delete: hanya super_admin
CREATE POLICY "siswa_delete"
  ON public.siswa FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- -----------------------------------------------
-- MASTER_POIN
-- -----------------------------------------------
-- Baca: semua authenticated user
CREATE POLICY "master_poin_select"
  ON public.master_poin FOR SELECT
  TO authenticated USING (true);

-- Insert/Update/Delete: hanya super_admin
CREATE POLICY "master_poin_insert"
  ON public.master_poin FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "master_poin_update"
  ON public.master_poin FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "master_poin_delete"
  ON public.master_poin FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- -----------------------------------------------
-- RIWAYAT_POIN
-- -----------------------------------------------
-- Baca: semua authenticated user
CREATE POLICY "riwayat_select"
  ON public.riwayat_poin FOR SELECT
  TO authenticated USING (true);

-- Insert: admin, guru, kepala_sekolah, piket
CREATE POLICY "riwayat_insert"
  ON public.riwayat_poin FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')
    )
  );

-- Delete: super_admin, atau guru yang mencatat poin tersebut
CREATE POLICY "riwayat_delete"
  ON public.riwayat_poin FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR guru_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );

-- Note: UPDATE pada riwayat_poin di-handle secara aplikasi
-- (delete + insert dengan trigger), bukan via RLS UPDATE policy.

-- -----------------------------------------------
-- ATURAN_KEHADIRAN
-- -----------------------------------------------
-- Baca: semua authenticated user
CREATE POLICY "aturan_kehadiran_select" ON public.aturan_kehadiran
  FOR SELECT TO authenticated USING (true);

-- Insert/Update/Delete: hanya super_admin
CREATE POLICY "aturan_kehadiran_insert" ON public.aturan_kehadiran
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "aturan_kehadiran_update" ON public.aturan_kehadiran
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "aturan_kehadiran_delete" ON public.aturan_kehadiran
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- -----------------------------------------------
-- KEHADIRAN
-- -----------------------------------------------
-- Baca: semua authenticated user
CREATE POLICY "kehadiran_select" ON public.kehadiran
  FOR SELECT TO authenticated USING (true);

-- Insert: super_admin, guru, kepala_sekolah, piket
CREATE POLICY "kehadiran_insert" ON public.kehadiran
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')));

-- Update: super_admin, guru, kepala_sekolah, piket
CREATE POLICY "kehadiran_update" ON public.kehadiran
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')));

-- Delete: super_admin, guru, kepala_sekolah, piket
CREATE POLICY "kehadiran_delete" ON public.kehadiran
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')));


-- =========================================================================
-- 6. STORAGE — FOTO PROFIL
-- =========================================================================

-- Buat bucket (jika belum ada, abaikan duplikat)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('profile-photos', 'profile-photos', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp']);
EXCEPTION WHEN unique_violation THEN
  NULL;
END $$;

-- Hapus semua policies lama yang mengandung 'foto' (termasuk yang dibuat script ini sebelumnya)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE '%foto%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Storage policies (nama mengandung 'foto' agar bersih saat run ulang)
CREATE POLICY "foto_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'profile-photos');

CREATE POLICY "foto_insert_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'profile-photos');

CREATE POLICY "foto_update_authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'profile-photos');

CREATE POLICY "foto_delete_authenticated"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'profile-photos');


-- =========================================================================
-- SELESAI! Database siap digunakan.
-- =========================================================================
