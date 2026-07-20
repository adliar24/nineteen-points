-- =========================================================================
-- FIX TABEL & RLS KEHADIRAN GURU
-- Jalankan di Supabase SQL Editor jika mengalami kendala simpan absensi guru
-- =========================================================================

-- 1. Lepas constraint NOT NULL pada kolom jam_masuk (agar status izin/sakit/alfa tidak error)
ALTER TABLE public.kehadiran_guru ALTER COLUMN jam_masuk DROP NOT NULL;

-- 2. Pastikan unique constraint per slot jadwal mengajar & tanggal aktif
ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_user_id_tanggal_key;
ALTER TABLE public.kehadiran_guru DROP CONSTRAINT IF EXISTS kehadiran_guru_jadwal_id_tanggal_key;
ALTER TABLE public.kehadiran_guru ADD CONSTRAINT kehadiran_guru_jadwal_id_tanggal_key UNIQUE (jadwal_id, tanggal);

-- 3. Perbarui RLS Policies agar Guru & Piket/Admin/Kepala Sekolah dapat melakukan simpan & edit absensi guru
DROP POLICY IF EXISTS "kehadiran_guru_select" ON public.kehadiran_guru;
CREATE POLICY "kehadiran_guru_select" ON public.kehadiran_guru
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kehadiran_guru_insert" ON public.kehadiran_guru;
CREATE POLICY "kehadiran_guru_insert" ON public.kehadiran_guru
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'kepala_sekolah', 'piket'))
  );

DROP POLICY IF EXISTS "kehadiran_guru_update" ON public.kehadiran_guru;
CREATE POLICY "kehadiran_guru_update" ON public.kehadiran_guru
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'kepala_sekolah', 'piket'))
  )
  WITH CHECK (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'kepala_sekolah', 'piket'))
  );

DROP POLICY IF EXISTS "kehadiran_guru_delete" ON public.kehadiran_guru;
CREATE POLICY "kehadiran_guru_delete" ON public.kehadiran_guru
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'kepala_sekolah', 'piket'))
  );
