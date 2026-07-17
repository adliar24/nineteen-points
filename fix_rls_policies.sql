-- =========================================================================
-- FIX RLS POLICIES — ROLE-BASED ACCESS CONTROL
-- Jalankan di Supabase SQL Editor setelah schema awal
-- =========================================================================

-- Hapus semua policies lama yang terlalu lemah (USING true)
-- profiles
DROP POLICY IF EXISTS "Akses baca profil terautentikasi" ON public.profiles;
DROP POLICY IF EXISTS "Akses penuh profil ke service role" ON public.profiles;
DROP POLICY IF EXISTS "Akses penuh profil oleh admin" ON public.profiles;

-- siswa
DROP POLICY IF EXISTS "Akses baca siswa oleh semua user terautentikasi" ON public.siswa;
DROP POLICY IF EXISTS "Akses penuh siswa oleh guru dan admin" ON public.siswa;

-- master_poin
DROP POLICY IF EXISTS "Akses penuh master_poin oleh semua user terautentikasi" ON public.master_poin;

-- riwayat_poin
DROP POLICY IF EXISTS "Akses baca riwayat oleh semua user terautentikasi" ON public.riwayat_poin;
DROP POLICY IF EXISTS "Akses penuh riwayat oleh guru dan admin" ON public.riwayat_poin;

-- =========================================================================
-- PROFILES — Baca semua, tulis hanya admin
-- =========================================================================
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "profiles_insert_admin"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "profiles_delete_admin"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- Service role bypasses RLS automatically, no extra policy needed.

-- =========================================================================
-- SISWA — Baca semua, tulis admin/guru/kepala_sekolah/piket
-- =========================================================================
CREATE POLICY "siswa_select_authenticated"
  ON public.siswa FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "siswa_insert_admin_guru"
  ON public.siswa FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')
    )
  );

CREATE POLICY "siswa_update_admin_guru"
  ON public.siswa FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')
    )
  );

CREATE POLICY "siswa_delete_admin_only"
  ON public.siswa FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- =========================================================================
-- MASTER_POIN — Baca semua, tulis hanya admin
-- =========================================================================
CREATE POLICY "master_poin_select_authenticated"
  ON public.master_poin FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "master_poin_insert_admin"
  ON public.master_poin FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "master_poin_update_admin"
  ON public.master_poin FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "master_poin_delete_admin"
  ON public.master_poin FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );

-- =========================================================================
-- RIWAYAT_POIN — Baca semua, insert guru/kepala_sekolah/piket, delete admin atau pencatat
-- =========================================================================
CREATE POLICY "riwayat_select_authenticated"
  ON public.riwayat_poin FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "riwayat_insert_guru_piket"
  ON public.riwayat_poin FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')
    )
  );

CREATE POLICY "riwayat_delete_admin_or_owner"
  ON public.riwayat_poin FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR guru_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
  );
