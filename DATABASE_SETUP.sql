-- =========================================================================
-- NINETEEN POINTS — FULL DATABASE SETUP (MASTER)
-- SMAN 19 BANDUNG
--
-- File SATU-SATUNYA untuk setup & migrasi database.
-- Semua migrasi terdahulu (kehadiran siswa, fitur guru, sertifikat,
-- face embedding, poin akses guru, dst.) sudah digabung ke file ini.
--
-- AMAN DIJALANKAN BERULANG KALI (idempotent — IF NOT EXISTS / CREATE OR REPLACE)
-- NON-DESTRUKTIF — TIDAK MENGHAPUS DATA YANG SUDAH ADA.
--
-- Cara pakai: jalankan SELURUH isi file ini di Supabase SQL Editor.
-- =========================================================================


-- =========================================================================
-- 1. HELPER FUNGSI
-- =========================================================================
-- is_staff(): true jika user adalah staf sekolah (bukan siswa)
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'kepala_sekolah', 'guru', 'piket', 'tata_usaha')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;


-- resolve_login(): untuk halaman login (belum autentikasi / anon).
-- Menerima username alternatif (dari nama) ATAU NIS, mengembalikan NIS
-- (yang sama dengan prefix email auth) supaya bisa login via email.
-- SECURITY DEFINER: anon hanya mendapat satu scalar NIS, bukan data siswa.
CREATE OR REPLACE FUNCTION public.resolve_login(p_login TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.nis::text
  FROM public.siswa s
  WHERE lower(s.username) = lower(regexp_replace(p_login, '[^a-z0-9]', '', 'g'))
     OR s.nis::text = lower(p_login)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login(TEXT) TO anon, authenticated;


-- =========================================================================
-- 2. TABEL
-- =========================================================================

-- 2a. SISWA
CREATE TABLE IF NOT EXISTS public.siswa (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nis            TEXT UNIQUE NOT NULL,
  nama           TEXT NOT NULL,
  kelas          TEXT NOT NULL,
  total_poin     INT DEFAULT 0 NOT NULL,
  foto_url       TEXT,
  face_embedding TEXT,
  username       TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS face_embedding TEXT;
ALTER TABLE public.siswa ADD COLUMN IF NOT EXISTS username TEXT;
COMMENT ON COLUMN public.siswa.face_embedding IS 'Vektor 128-float embedding wajah dalam format string dipisahkan koma';
COMMENT ON COLUMN public.siswa.username IS 'Username alternatif (dari nama, lowercase tanpa spasi) untuk login murid';

CREATE UNIQUE INDEX IF NOT EXISTS idx_siswa_username
  ON public.siswa (username)
  WHERE username IS NOT NULL;

-- 2b. MASTER BOBOT POIN (ATURAN BAKU)
CREATE TABLE IF NOT EXISTS public.master_poin (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nama_poin           TEXT NOT NULL,
  nilai_poin          INT NOT NULL,
  allowed_guru_emails TEXT[]
);

ALTER TABLE public.master_poin ADD COLUMN IF NOT EXISTS allowed_guru_emails TEXT[];

-- 2c. RIWAYAT POIN SISWA (LOG AUDIT)
CREATE TABLE IF NOT EXISTS public.riwayat_poin (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  siswa_id        UUID REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  nilai_diberikan INT NOT NULL,
  nama_poin       TEXT NOT NULL,
  guru_email      TEXT NOT NULL,
  semester        TEXT NOT NULL DEFAULT '2025/2026 Ganjil',
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.riwayat_poin ADD COLUMN IF NOT EXISTS semester TEXT NOT NULL DEFAULT '2025/2026 Ganjil';
ALTER TABLE public.riwayat_poin ADD COLUMN IF NOT EXISTS kehadiran_id UUID;

-- 2d. PROFILES (HAK AKSES / ROLE-BASED ACCESS CONTROL)
CREATE TABLE IF NOT EXISTS public.profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  nama           TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('super_admin', 'kepala_sekolah', 'guru', 'siswa', 'piket', 'tata_usaha')),
  nis            TEXT REFERENCES public.siswa(nis) ON DELETE SET NULL,
  foto_url       TEXT,
  face_embedding TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS face_embedding TEXT;

-- Pastikan semua role terdaftar di constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'kepala_sekolah', 'guru', 'siswa', 'piket', 'tata_usaha'));

-- 2e. ATURAN KEHADIRAN
CREATE TABLE IF NOT EXISTS public.aturan_kehadiran (
  status     TEXT PRIMARY KEY CHECK (status IN ('tepat_waktu', 'telat_5', 'telat_10', 'telat_15', 'alfa', 'sakit', 'izin')),
  label      TEXT NOT NULL,
  nilai_poin INT NOT NULL
);

ALTER TABLE public.aturan_kehadiran DROP CONSTRAINT IF EXISTS aturan_kehadiran_status_check;
ALTER TABLE public.aturan_kehadiran ADD CONSTRAINT aturan_kehadiran_status_check
  CHECK (status IN ('tepat_waktu', 'telat_5', 'telat_10', 'telat_15', 'alfa', 'sakit', 'izin'));

-- 2f. CATATAN KEHADIRAN
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

-- Hubungkan foreign key kehadiran_id di riwayat_poin (setelah tabel kehadiran ada)
ALTER TABLE public.riwayat_poin DROP CONSTRAINT IF EXISTS riwayat_poin_kehadiran_id_fkey;
ALTER TABLE public.riwayat_poin ADD CONSTRAINT riwayat_poin_kehadiran_id_fkey
  FOREIGN KEY (kehadiran_id) REFERENCES public.kehadiran(id) ON DELETE CASCADE;

-- 2g. JADWAL GURU (MENGAJAR KBM)
CREATE TABLE IF NOT EXISTS public.jadwal_guru (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID NOT NULL,                                             -- guru pengajar
  hari           TEXT NOT NULL,                                             -- "Senin", "Selasa", ...
  mata_pelajaran TEXT NOT NULL,
  kelas          TEXT NOT NULL,
  jam_mulai      TIME WITHOUT TIME ZONE NOT NULL,
  jam_selesai    TIME WITHOUT TIME ZONE NOT NULL,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.jadwal_guru DROP CONSTRAINT IF EXISTS jadwal_guru_user_id_fkey;
ALTER TABLE public.jadwal_guru ADD CONSTRAINT jadwal_guru_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2h. KEHADIRAN GURU
-- DIBUAT NON-DESTRUKTIF: tidak memakai DROP TABLE, data lama tetap aman.
CREATE TABLE IF NOT EXISTS public.kehadiran_guru (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  tanggal    DATE DEFAULT CURRENT_DATE NOT NULL,
  jam_masuk  TIME WITHOUT TIME ZONE,
  status     TEXT CHECK (status IN ('hadir', 'sakit', 'izin', 'alfa')) DEFAULT 'hadir' NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_user_id_fkey;
ALTER TABLE public.kehadiran_guru ADD CONSTRAINT kehadiran_guru_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.kehadiran_guru ALTER COLUMN jam_masuk DROP NOT NULL;
ALTER TABLE public.kehadiran_guru ADD COLUMN IF NOT EXISTS jadwal_id UUID REFERENCES public.jadwal_guru(id) ON DELETE CASCADE;

-- Satu slot jadwal mengajar hanya boleh di-absen sekali per tanggal
ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_user_id_tanggal_key;
ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_jadwal_id_tanggal_key;
ALTER TABLE public.kehadiran_guru ADD CONSTRAINT kehadiran_guru_jadwal_id_tanggal_key UNIQUE (jadwal_id, tanggal);

-- 2i. KEGIATAN GURU (DATA SERTIFIKAT)
CREATE TABLE IF NOT EXISTS public.kegiatan_guru (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL,                                             -- penerima sertifikat (guru)
  nama_kegiatan    TEXT NOT NULL,
  tanggal_kegiatan DATE NOT NULL,
  peran            TEXT NOT NULL,                                             -- "Peserta", "Narasumber", "Panitia"
  no_sertifikat    TEXT,
  penyelenggara    TEXT DEFAULT 'SMAN 19 Bandung' NOT NULL,
  durasi_jam       INT,                                                       -- JP (Jam Pelajaran)
  materi_jp        JSONB,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.kegiatan_guru DROP CONSTRAINT IF EXISTS kegiatan_guru_user_id_fkey;
ALTER TABLE public.kegiatan_guru ADD CONSTRAINT kegiatan_guru_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.kegiatan_guru ADD COLUMN IF NOT EXISTS materi_jp JSONB DEFAULT NULL;

-- 2j. POIN AKSES GURU (relasi pendukung allowed_guru_emails)
CREATE TABLE IF NOT EXISTS public.poin_akses_guru (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poin_id    UUID REFERENCES public.master_poin(id) ON DELETE CASCADE,
  guru_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2k. KONFIGURASI DESAIN SERTIFIKAT
CREATE TABLE IF NOT EXISTS public.sertifikat_config (
  id         TEXT PRIMARY KEY,
  config     JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2l. PENGATURAN SISTEM (JAM SCAN PRESENSI MANDIRI & KOORDINAT GPS)
CREATE TABLE IF NOT EXISTS public.pengaturan_sistem (
  kunci      TEXT PRIMARY KEY,
  nilai      TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- =========================================================================
-- 3. INDEXES (PERFORMA)
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_siswa_nis   ON public.siswa(nis);
CREATE INDEX IF NOT EXISTS idx_siswa_nama  ON public.siswa(nama);

CREATE INDEX IF NOT EXISTS idx_riwayat_poin_siswa_id   ON public.riwayat_poin(siswa_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_created_at ON public.riwayat_poin(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role  ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_nis   ON public.profiles(nis);

CREATE INDEX IF NOT EXISTS idx_kehadiran_siswa_id ON public.kehadiran(siswa_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_tanggal ON public.kehadiran(tanggal DESC);

CREATE INDEX IF NOT EXISTS idx_jadwal_guru_user_id ON public.jadwal_guru(user_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_guru_hari    ON public.jadwal_guru(hari);

CREATE INDEX IF NOT EXISTS idx_kehadiran_guru_user_id ON public.kehadiran_guru(user_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_guru_tanggal ON public.kehadiran_guru(tanggal DESC);

CREATE INDEX IF NOT EXISTS idx_kegiatan_guru_user_id ON public.kegiatan_guru(user_id);

CREATE INDEX IF NOT EXISTS idx_poin_akses_guru_poin_id ON public.poin_akses_guru(poin_id);
CREATE INDEX IF NOT EXISTS idx_poin_akses_guru_email   ON public.poin_akses_guru(guru_email);


-- =========================================================================
-- 4. TRIGGERS
-- =========================================================================

-- 4a. AUTO-CREATE PROFIL SAAT USER BARU DAFTAR + AUTO-SYNC FOTO DARI TABEL SISWA
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_foto_url TEXT := NULL;
  v_nis TEXT;
BEGIN
  v_nis := NEW.raw_user_meta_data->>'nis';
  IF v_nis IS NOT NULL THEN
    SELECT foto_url INTO v_foto_url FROM public.siswa WHERE nis = v_nis LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, nama, role, nis, foto_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'fullName', 'Pengguna Baru'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'siswa'),
    v_nis,
    v_foto_url
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4b. AUTO-UPDATE total_poin SAAT RIWAYAT DITAMBAH
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

-- 4c. AUTO-UPDATE total_poin SAAT RIWAYAT DIHAPUS
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

-- 4d. AUTO-UPDATE total_poin SAAT RIWAYAT DIUBAH (UPDATE)
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

-- 4e. AUTO-SYNC RIWAYAT POIN SAAT KEHADIRAN DITAMBAH (INSERT)
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

-- 4f. AUTO-SYNC RIWAYAT POIN SAAT KEHADIRAN DIUBAH (UPDATE)
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
-- 5. SEED DATA — ATURAN MASTER POIN BAKU SMAN 19 BANDUNG
-- =========================================================================

INSERT INTO public.master_poin (nama_poin, nilai_poin) VALUES
('Juara Umum Lomba Nasional (Akademik/Non-Akademik)', 100),
('Juara Tingkat Provinsi / Kota', 50),
('Sikap Terpuji & Membantu Guru (KBM)', 15),
('Merapikan & Menjaga Kebersihan Kelas', 10),
('Mengumpulkan Tugas Tepat Waktu', 5),
('Sholat Berjamaah', 2),
('Terlambat Masuk Sekolah (>15 Menit)', -15),
('Membuang Sampah Sembarangan', -10),
('Atribut Seragam Tidak Lengkap', -10),
('Membuat Kegaduhan di Kelas', -15),
('Bolos Jam Pelajaran', -25)
ON CONFLICT DO NOTHING;

-- Seed data aturan kehadiran default
INSERT INTO public.aturan_kehadiran (status, label, nilai_poin) VALUES
('tepat_waktu', 'Hadir Tepat Waktu', 15),
('telat_5',      'Terlambat 5 Menit', -5),
('telat_10',     'Terlambat 10 Menit', -10),
('telat_15',     'Terlambat 15 Menit', -15),
('alfa',         'Alfa / Tanpa Keterangan', -25),
('sakit',        'Sakit', 0),
('izin',         'Izin', 0)
ON CONFLICT (status) DO UPDATE
SET label = EXCLUDED.label, nilai_poin = EXCLUDED.nilai_poin;

-- Seed data pengaturan sistem default (jam presensi & lokasi GPS)
INSERT INTO public.pengaturan_sistem (kunci, nilai) VALUES
('scan_start', '06:30'),
('scan_end',   '06:45'),
('gps_lat',    '-6.914744'),
('gps_lng',    '107.609810'),
('gps_radius', '150')
ON CONFLICT (kunci) DO NOTHING;


-- =========================================================================
-- 6. ROW LEVEL SECURITY (RLS) — POLICY LONGGAR
-- =========================================================================
-- Filosofi: SEMUA staf (super_admin, kepala_sekolah, guru, piket, tata_usaha)
-- dapat membaca & menulis SEMUA tabel tanpa error. Siswa hanya bisa membaca.
-- Service role (kunci admin di backend) otomatis melewati RLS.

ALTER TABLE public.siswa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_poin      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_poin     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aturan_kehadiran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kehadiran        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_guru      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kehadiran_guru   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kegiatan_guru    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poin_akses_guru  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sertifikat_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengaturan_sistem ENABLE ROW LEVEL SECURITY;

-- Hapus semua policies lama agar bisa dijalankan ulang tanpa duplikat
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'siswa', 'master_poin', 'riwayat_poin',
        'aturan_kehadiran', 'kehadiran', 'jadwal_guru',
        'kehadiran_guru', 'kegiatan_guru', 'poin_akses_guru',
        'sertifikat_config', 'pengaturan_sistem'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- -----------------------------------------------
-- PROFILES (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_staff());

-- -----------------------------------------------
-- SISWA (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "siswa_select" ON public.siswa
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "siswa_insert" ON public.siswa
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "siswa_update" ON public.siswa
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "siswa_delete" ON public.siswa
  FOR DELETE TO authenticated
  USING (public.is_staff());

-- -----------------------------------------------
-- MASTER_POIN (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "master_poin_select" ON public.master_poin
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "master_poin_insert" ON public.master_poin
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());

CREATE POLICY "master_poin_update" ON public.master_poin
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "master_poin_delete" ON public.master_poin
  FOR DELETE TO authenticated
  USING (public.is_staff());

-- -----------------------------------------------
-- RIWAYAT_POIN (baca semua; tulis staf atau murid via presensi mandiri)
-- -----------------------------------------------
CREATE POLICY "riwayat_select" ON public.riwayat_poin
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "riwayat_insert" ON public.riwayat_poin
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "riwayat_update" ON public.riwayat_poin
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "riwayat_delete" ON public.riwayat_poin
  FOR DELETE TO authenticated
  USING (public.is_staff());

-- -----------------------------------------------
-- ATURAN_KEHADIRAN (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "aturan_kehadiran_select" ON public.aturan_kehadiran
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "aturan_kehadiran_insert" ON public.aturan_kehadiran
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "aturan_kehadiran_update" ON public.aturan_kehadiran
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "aturan_kehadiran_delete" ON public.aturan_kehadiran
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- KEHADIRAN (baca semua; tulis staf atau murid via presensi mandiri)
-- -----------------------------------------------
CREATE POLICY "kehadiran_select" ON public.kehadiran
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "kehadiran_insert" ON public.kehadiran
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "kehadiran_update" ON public.kehadiran
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "kehadiran_delete" ON public.kehadiran
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- JADWAL_GURU (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "jadwal_guru_select" ON public.jadwal_guru
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "jadwal_guru_insert" ON public.jadwal_guru
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "jadwal_guru_update" ON public.jadwal_guru
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "jadwal_guru_delete" ON public.jadwal_guru
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- KEHADIRAN_GURU (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "kehadiran_guru_select" ON public.kehadiran_guru
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "kehadiran_guru_insert" ON public.kehadiran_guru
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "kehadiran_guru_update" ON public.kehadiran_guru
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "kehadiran_guru_delete" ON public.kehadiran_guru
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- KEGIATAN_GURU (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "kegiatan_guru_select" ON public.kegiatan_guru
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "kegiatan_guru_insert" ON public.kegiatan_guru
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "kegiatan_guru_update" ON public.kegiatan_guru
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "kegiatan_guru_delete" ON public.kegiatan_guru
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- POIN_AKSES_GURU (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "poin_akses_guru_select" ON public.poin_akses_guru
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "poin_akses_guru_insert" ON public.poin_akses_guru
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "poin_akses_guru_update" ON public.poin_akses_guru
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "poin_akses_guru_delete" ON public.poin_akses_guru
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- SERTIFIKAT_CONFIG (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "sertifikat_config_select" ON public.sertifikat_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sertifikat_config_insert" ON public.sertifikat_config
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "sertifikat_config_update" ON public.sertifikat_config
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "sertifikat_config_delete" ON public.sertifikat_config
  FOR DELETE TO authenticated USING (public.is_staff());

-- -----------------------------------------------
-- PENGATURAN_SISTEM (baca semua; tulis hanya staf)
-- -----------------------------------------------
CREATE POLICY "pengaturan_sistem_select" ON public.pengaturan_sistem
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "pengaturan_sistem_insert" ON public.pengaturan_sistem
  FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "pengaturan_sistem_update" ON public.pengaturan_sistem
  FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "pengaturan_sistem_delete" ON public.pengaturan_sistem
  FOR DELETE TO authenticated USING (public.is_staff());


-- =========================================================================
-- 7. STORAGE — FOTO PROFIL
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
