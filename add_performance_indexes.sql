-- =========================================================================
-- PERFORMANCE INDEXES — NineTeen Points
-- AMAN DIJALANKAN BERULANG KALI (IF NOT EXISTS)
-- =========================================================================

-- Riwayat poin: filter by siswa_id, order by created_at
-- Ini query paling berat (getRiwayatList, SiswaDashboardView)
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_siswa_id ON public.riwayat_poin(siswa_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_poin_created_at ON public.riwayat_poin(created_at DESC);

-- Profiles: filter by email (login), by role (role-based queries)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Siswa: order by nama (getSiswaList)
CREATE INDEX IF NOT EXISTS idx_siswa_nama ON public.siswa(nama);
