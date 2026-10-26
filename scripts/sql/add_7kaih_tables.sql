-- =========================================================================
-- MIGRASI 7 KAIH (7 KEBIASAAN ANAK INDONESIA HEBAT)
-- SMAN 19 BANDUNG
--
-- File migrasi aman & non-destruktif (idempotent).
-- Jalankan di Supabase SQL Editor.
-- =========================================================================

-- 1. TABEL CHECKLIST 7 KAIH
CREATE TABLE IF NOT EXISTS public.tujuh_kaih (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  siswa_id                 UUID REFERENCES public.siswa(id) ON DELETE CASCADE NOT NULL,
  tanggal                  DATE DEFAULT CURRENT_DATE NOT NULL,

  -- 1. Bangun Pagi
  bangun_pagi_waktu        TIME WITHOUT TIME ZONE,
  bangun_pagi_target_sesuai BOOLEAN DEFAULT FALSE,

  -- 2. Beribadah
  salat_subuh              BOOLEAN DEFAULT FALSE NOT NULL,
  salat_zuhur              BOOLEAN DEFAULT FALSE NOT NULL,
  salat_asar               BOOLEAN DEFAULT FALSE NOT NULL,
  salat_magrib             BOOLEAN DEFAULT FALSE NOT NULL,
  salat_isya               BOOLEAN DEFAULT FALSE NOT NULL,

  -- 2b. Pendukung Beribadah: Mengaji
  mengaji_status           TEXT CHECK (mengaji_status IN ('belum_diisi', 'belum', 'sudah')) DEFAULT 'belum_diisi' NOT NULL,
  mengaji_surah            TEXT,
  mengaji_ayat_awal        INT,
  mengaji_ayat_akhir       INT,
  mengaji_catatan          TEXT,

  -- 3. Berolahraga
  olahraga_status          TEXT CHECK (olahraga_status IN ('belum_diisi', 'belum', 'sudah')) DEFAULT 'belum_diisi' NOT NULL,
  olahraga_jenis           TEXT,
  olahraga_durasi_menit    INT,

  -- 4. Makan Sehat dan Bergizi
  sarapan_status           TEXT CHECK (sarapan_status IN ('belum_diisi', 'belum', 'sudah')) DEFAULT 'belum_diisi' NOT NULL,
  sarapan_bergizi          BOOLEAN DEFAULT FALSE NOT NULL,
  sarapan_menu             TEXT,

  makan_siang_status       TEXT CHECK (makan_siang_status IN ('belum_diisi', 'belum', 'sudah')) DEFAULT 'belum_diisi' NOT NULL,
  makan_siang_bergizi      BOOLEAN DEFAULT FALSE NOT NULL,
  makan_siang_menu         TEXT,

  makan_malam_status       TEXT CHECK (makan_malam_status IN ('belum_diisi', 'belum', 'sudah')) DEFAULT 'belum_diisi' NOT NULL,
  makan_malam_bergizi      BOOLEAN DEFAULT FALSE NOT NULL,
  makan_malam_menu         TEXT,

  -- 5. Gemar Belajar
  belajar_kegiatan         JSONB DEFAULT '[]'::jsonb NOT NULL,
  belajar_total_durasi     INT DEFAULT 0 NOT NULL,

  -- 6. Bermasyarakat
  bermasyarakat_status     TEXT CHECK (bermasyarakat_status IN ('belum_diisi', 'belum', 'sudah')) DEFAULT 'belum_diisi' NOT NULL,
  bermasyarakat_kegiatan   TEXT,

  -- 7. Tidur Cepat
  tidur_cepat_waktu        TIME WITHOUT TIME ZONE,
  tidur_cepat_target_sesuai BOOLEAN DEFAULT FALSE,

  -- Progres 0 - 100%
  progres_persen           INT DEFAULT 0 NOT NULL,

  -- Status Pengiriman Final (Terkunci jika true)
  is_final                 BOOLEAN DEFAULT FALSE NOT NULL,
  waktu_kirim_final        TIMESTAMP WITH TIME ZONE,

  created_at               TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at               TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Cegah data ganda pada siswa & tanggal yang sama
  UNIQUE (siswa_id, tanggal)
);

ALTER TABLE public.tujuh_kaih ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT FALSE;
ALTER TABLE public.tujuh_kaih ADD COLUMN IF NOT EXISTS waktu_kirim_final TIMESTAMP WITH TIME ZONE;

-- 2. TABEL PENUGASAN GURU / KEPALA SEKOLAH PEMANTAU 7 KAIH
CREATE TABLE IF NOT EXISTS public.guru_penugasan_7kaih (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guru_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  kelas      TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (guru_id, kelas)
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_tujuh_kaih_siswa_id ON public.tujuh_kaih(siswa_id);
CREATE INDEX IF NOT EXISTS idx_tujuh_kaih_tanggal  ON public.tujuh_kaih(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_tujuh_kaih_siswa_tgl ON public.tujuh_kaih(siswa_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_guru_penugasan_guru  ON public.guru_penugasan_7kaih(guru_id);
CREATE INDEX IF NOT EXISTS idx_guru_penugasan_kelas ON public.guru_penugasan_7kaih(kelas);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tujuh_kaih ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guru_penugasan_7kaih ENABLE ROW LEVEL SECURITY;

-- Bersihkan policies lama bila ada
DROP POLICY IF EXISTS "tujuh_kaih_select" ON public.tujuh_kaih;
DROP POLICY IF EXISTS "tujuh_kaih_insert" ON public.tujuh_kaih;
DROP POLICY IF EXISTS "tujuh_kaih_update" ON public.tujuh_kaih;
DROP POLICY IF EXISTS "tujuh_kaih_delete" ON public.tujuh_kaih;

DROP POLICY IF EXISTS "guru_penugasan_select" ON public.guru_penugasan_7kaih;
DROP POLICY IF EXISTS "guru_penugasan_insert" ON public.guru_penugasan_7kaih;
DROP POLICY IF EXISTS "guru_penugasan_delete" ON public.guru_penugasan_7kaih;

-- POLICIES TUJUH_KAIH:
-- Murid: Hanya baca datanya sendiri
-- Super Admin: Akses penuh
-- Guru & Kepsek yang dipilih Admin: Hanya baca murid di kelas yang ditugaskan (atau Semua jika ditugaskan Semua)
CREATE POLICY "tujuh_kaih_select" ON public.tujuh_kaih
  FOR SELECT TO authenticated
  USING (
    -- 1. Murid baca datanya sendiri
    siswa_id IN (
      SELECT s.id FROM public.siswa s
      JOIN public.profiles p ON p.nis = s.nis
      WHERE p.id = auth.uid()
    )
    OR
    -- 2. Super admin
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
    OR
    -- 3. Guru / Kepsek yang secara eksplisit ditugaskan oleh Admin di guru_penugasan_7kaih
    EXISTS (
      SELECT 1 FROM public.guru_penugasan_7kaih gp
      LEFT JOIN public.siswa s ON s.kelas = gp.kelas
      WHERE gp.guru_id = auth.uid()
        AND (gp.kelas = 'Semua' OR s.id = tujuh_kaih.siswa_id)
    )
  );

-- Murid insert datanya sendiri ATAU Super Admin
CREATE POLICY "tujuh_kaih_insert" ON public.tujuh_kaih
  FOR INSERT TO authenticated
  WITH CHECK (
    siswa_id IN (
      SELECT s.id FROM public.siswa s
      JOIN public.profiles p ON p.nis = s.nis
      WHERE p.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin')
    )
  );

-- Murid update datanya sendiri SELAMA BELUM DIKUNCI (is_final = false).
-- Jika sudah dikunci (is_final = true), HANYA Super Admin yang bisa mengubah/membuka kunci.
CREATE POLICY "tujuh_kaih_update" ON public.tujuh_kaih
  FOR UPDATE TO authenticated
  USING (
    (
      siswa_id IN (
        SELECT s.id FROM public.siswa s
        JOIN public.profiles p ON p.nis = s.nis
        WHERE p.id = auth.uid()
      )
      AND (is_final = false OR is_final IS NULL)
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin')
    )
  )
  WITH CHECK (
    siswa_id IN (
      SELECT s.id FROM public.siswa s
      JOIN public.profiles p ON p.nis = s.nis
      WHERE p.id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('super_admin')
    )
  );

-- Delete hanya super_admin
CREATE POLICY "tujuh_kaih_delete" ON public.tujuh_kaih
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- POLICIES GURU_PENUGASAN_7KAIH:
-- Baca: User yang bersangkutan (guru_id = auth.uid()) ATAU Super Admin
CREATE POLICY "guru_penugasan_select" ON public.guru_penugasan_7kaih
  FOR SELECT TO authenticated
  USING (
    guru_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Insert: Hanya super_admin
CREATE POLICY "guru_penugasan_insert" ON public.guru_penugasan_7kaih
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );

-- Delete: Hanya super_admin
CREATE POLICY "guru_penugasan_delete" ON public.guru_penugasan_7kaih
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'super_admin'
    )
  );
