-- =========================================================================
-- MIGRASI FITUR KEHADIRAN SISWA — NineTeen Points SMAN 19 Bandung
-- Jalankan file ini sekali di SQL Editor Supabase Anda
-- =========================================================================

-- 1. TABEL ATURAN KEHADIRAN
CREATE TABLE IF NOT EXISTS public.aturan_kehadiran (
  status       TEXT PRIMARY KEY CHECK (status IN ('tepat_waktu', 'telat_5', 'telat_10', 'telat_15', 'alfa', 'sakit', 'izin')),
  label        TEXT NOT NULL,
  nilai_poin   INT NOT NULL
);

-- Sesuaikan CHECK constraint jika tabel sudah ada
ALTER TABLE public.aturan_kehadiran DROP CONSTRAINT IF EXISTS aturan_kehadiran_status_check;
ALTER TABLE public.aturan_kehadiran ADD CONSTRAINT aturan_kehadiran_status_check
  CHECK (status IN ('tepat_waktu', 'telat_5', 'telat_10', 'telat_15', 'alfa', 'sakit', 'izin'));

-- Seed Data Awal
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

-- 2. TABEL CATATAN KEHADIRAN
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

-- Sesuaikan CHECK constraint pada tabel kehadiran jika sudah ada
ALTER TABLE public.kehadiran DROP CONSTRAINT IF EXISTS kehadiran_status_check;

-- 3. KOLOM LINK KEHADIRAN DI RIWAYAT_POIN
ALTER TABLE public.riwayat_poin 
ADD COLUMN IF NOT EXISTS kehadiran_id UUID REFERENCES public.kehadiran(id) ON DELETE CASCADE;

-- 4. INDEKS BARU UNTUK KINERJA
CREATE INDEX IF NOT EXISTS idx_kehadiran_siswa_id ON public.kehadiran(siswa_id);
CREATE INDEX IF NOT EXISTS idx_kehadiran_tanggal ON public.kehadiran(tanggal DESC);

-- 5. TRIGGER DI RIWAYAT_POIN UNTUK UPDATE
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

-- 6. TRIGGER DI KEHADIRAN UNTUK SINKRONISASI POIN (INSERT & UPDATE)
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

-- 7. KEAMANAN: RLS POLICIES
ALTER TABLE public.aturan_kehadiran ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kehadiran ENABLE ROW LEVEL SECURITY;

-- Hapus policies jika ada untuk menghindari duplikasi
DROP POLICY IF EXISTS "aturan_kehadiran_select" ON public.aturan_kehadiran;
DROP POLICY IF EXISTS "aturan_kehadiran_insert" ON public.aturan_kehadiran;
DROP POLICY IF EXISTS "aturan_kehadiran_update" ON public.aturan_kehadiran;
DROP POLICY IF EXISTS "aturan_kehadiran_delete" ON public.aturan_kehadiran;

DROP POLICY IF EXISTS "kehadiran_select" ON public.kehadiran;
DROP POLICY IF EXISTS "kehadiran_insert" ON public.kehadiran;
DROP POLICY IF EXISTS "kehadiran_update" ON public.kehadiran;
DROP POLICY IF EXISTS "kehadiran_delete" ON public.kehadiran;

-- Policies Aturan Kehadiran
CREATE POLICY "aturan_kehadiran_select" ON public.aturan_kehadiran
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "aturan_kehadiran_insert" ON public.aturan_kehadiran
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "aturan_kehadiran_update" ON public.aturan_kehadiran
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "aturan_kehadiran_delete" ON public.aturan_kehadiran
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'));

-- Policies Kehadiran
CREATE POLICY "kehadiran_select" ON public.kehadiran
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "kehadiran_insert" ON public.kehadiran
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')));

CREATE POLICY "kehadiran_update" ON public.kehadiran
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')));

CREATE POLICY "kehadiran_delete" ON public.kehadiran
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('super_admin', 'guru', 'kepala_sekolah', 'piket')));
