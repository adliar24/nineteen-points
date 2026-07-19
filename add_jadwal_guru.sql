-- =========================================================================
-- MIGRASI FITUR JADWAL GURU
-- Nineteen Space SMAN 19 Bandung
-- =========================================================================

-- 1. TABEL JADWAL GURU
CREATE TABLE IF NOT EXISTS public.jadwal_guru (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, -- guru pengajar
  hari            TEXT NOT NULL,                                             -- "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"
  mata_pelajaran  TEXT NOT NULL,                                             -- e.g. "Matematika", "Fisika"
  kelas           TEXT NOT NULL,                                             -- e.g. "XI-A", "XII-B"
  jam_mulai       TIME WITHOUT TIME ZONE NOT NULL,                           -- e.g. "07:30:00"
  jam_selesai     TIME WITHOUT TIME ZONE NOT NULL,                           -- e.g. "09:00:00"
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. INDEX UNTUK PERFORMA
CREATE INDEX IF NOT EXISTS idx_jadwal_guru_user_id ON public.jadwal_guru(user_id);
CREATE INDEX IF NOT EXISTS idx_jadwal_guru_hari ON public.jadwal_guru(hari);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.jadwal_guru ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika ada
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jadwal_guru'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.jadwal_guru', pol.policyname);
  END LOOP;
END $$;

-- 4. POLICIES JADWAL GURU
-- SELECT: Semua user terautentikasi dapat melihat semua jadwal (untuk info sekolah)
CREATE POLICY "jadwal_guru_select" ON public.jadwal_guru
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: Hanya super_admin
CREATE POLICY "jadwal_guru_insert" ON public.jadwal_guru
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- UPDATE: Hanya super_admin
CREATE POLICY "jadwal_guru_update" ON public.jadwal_guru
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- DELETE: Hanya super_admin
CREATE POLICY "jadwal_guru_delete" ON public.jadwal_guru
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
