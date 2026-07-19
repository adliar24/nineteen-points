-- =========================================================================
-- MIGRASI FITUR GURU (KEHADIRAN & SERTIFIKAT KEGIATAN)
-- Nineteen Space SMAN 19 Bandung
-- =========================================================================

-- 1. TABEL KEHADIRAN GURU
CREATE TABLE IF NOT EXISTS public.kehadiran_guru (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tanggal         DATE DEFAULT CURRENT_DATE NOT NULL,
  jam_masuk       TIME WITHOUT TIME ZONE,
  jam_keluar      TIME WITHOUT TIME ZONE,
  status          TEXT CHECK (status IN ('hadir', 'sakit', 'izin', 'alfa')) DEFAULT 'hadir' NOT NULL,
  keterangan      TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (user_id, tanggal)
);

-- 2. TABEL KEGIATAN GURU (DATA SERTIFIKAT)
CREATE TABLE IF NOT EXISTS public.kegiatan_guru (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- penerima sertifikat (guru)
  nama_kegiatan   TEXT NOT NULL,                                             -- contoh: "IHT Implementasi Kurikulum Merdeka"
  tanggal_kegiatan DATE NOT NULL,
  peran           TEXT NOT NULL,                                             -- "Peserta", "Narasumber", "Panitia"
  no_sertifikat   TEXT,                                                      -- nomor surat sertifikat
  penyelenggara   TEXT DEFAULT 'SMAN 19 Bandung' NOT NULL,
  durasi_jam      INT,                                                       -- JP (Jam Pelajaran), contoh: 32
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. INDEX UNTUK PERFORMA
CREATE INDEX IF NOT EXISTS idx_kehadiran_guru_user_id ON public.kehadiran_guru(user_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_guru_tanggal ON public.kehadiran_guru(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_kegiatan_guru_user_id ON public.kegiatan_guru(user_id);

-- 4. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.kehadiran_guru ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kegiatan_guru ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada (untuk kelancaran eksekusi berulang)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('kehadiran_guru', 'kegiatan_guru')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 5. POLICIES KEHADIRAN GURU
-- SELECT: Guru bisa melihat miliknya sendiri, Admin/Kepala Sekolah bisa melihat semua
CREATE POLICY "kehadiran_guru_select" ON public.kehadiran_guru
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'kepala_sekolah'))
  );

-- INSERT: Guru bisa check-in miliknya sendiri
CREATE POLICY "kehadiran_guru_insert" ON public.kehadiran_guru
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );

-- UPDATE: Guru bisa check-out miliknya sendiri, Admin bisa edit data siapapun
CREATE POLICY "kehadiran_guru_update" ON public.kehadiran_guru
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- DELETE: Hanya super_admin
CREATE POLICY "kehadiran_guru_delete" ON public.kehadiran_guru
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );


-- 6. POLICIES KEGIATAN GURU (SERTIFIKAT)
-- SELECT: Guru bisa melihat kegiatannya sendiri, Admin/Kepala Sekolah bisa melihat semua
CREATE POLICY "kegiatan_guru_select" ON public.kegiatan_guru
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'kepala_sekolah'))
  );

-- INSERT: Hanya super_admin
CREATE POLICY "kegiatan_guru_insert" ON public.kegiatan_guru
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- UPDATE: Hanya super_admin
CREATE POLICY "kegiatan_guru_update" ON public.kegiatan_guru
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- DELETE: Hanya super_admin
CREATE POLICY "kegiatan_guru_delete" ON public.kegiatan_guru
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
