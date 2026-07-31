-- =========================================================================
-- PENAMBAHAN FITUR AKSES POIN PER GURU & SHOLAT JUMAT
-- Nineteen Points - SMAN 19 Bandung
-- =========================================================================

-- 1. Tambahkan kolom allowed_guru_emails pada tabel master_poin
ALTER TABLE public.master_poin ADD COLUMN IF NOT EXISTS allowed_guru_emails TEXT[];

-- 2. Buat tabel poin_akses_guru (sebagai relasi pendukung)
CREATE TABLE IF NOT EXISTS public.poin_akses_guru (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  poin_id UUID REFERENCES public.master_poin(id) ON DELETE CASCADE,
  guru_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_poin_akses_guru_poin_id ON public.poin_akses_guru(poin_id);
CREATE INDEX IF NOT EXISTS idx_poin_akses_guru_email ON public.poin_akses_guru(guru_email);

-- 3. Matikan RLS atau izinkan akses publik/authenticated untuk poin_akses_guru
ALTER TABLE public.poin_akses_guru DISABLE ROW LEVEL SECURITY;
