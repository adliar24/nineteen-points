-- =========================================================================
-- MIGRASI FITUR SERTIFIKAT CONFIG (SINKRONISASI DESAIN SERTIFIKAT)
-- Nineteen Space SMAN 19 Bandung
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.sertifikat_config (
  id          TEXT PRIMARY KEY,
  config      JSONB NOT NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.sertifikat_config ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DO $$
BEGIN
  DROP POLICY IF EXISTS "sertifikat_config_select" ON public.sertifikat_config;
  DROP POLICY IF EXISTS "sertifikat_config_all" ON public.sertifikat_config;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- 1. Akses SELECT: Semua user terautentikasi bisa membaca layout config sertifikat
CREATE POLICY "sertifikat_config_select" ON public.sertifikat_config
  FOR SELECT TO authenticated
  USING (true);

-- 2. Akses ALL (Tulis/Ubah): Hanya super_admin yang bisa menyimpan desain sertifikat
CREATE POLICY "sertifikat_config_all" ON public.sertifikat_config
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin')
  );
