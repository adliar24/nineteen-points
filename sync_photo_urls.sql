-- =========================================================================
-- SQL MIGRASI: MENYINKRONKAN FOTO PROFIL ANTARA TABEL SISWA DAN PROFILES
-- Jalankan kode ini di SQL Editor Supabase Anda
-- =========================================================================

-- 1. Sinkronisasi data foto_url yang sudah ada
-- Dari siswa ke profiles (Murid yang fotonya ada di Kelola Murid tapi kosong di Pengaturan Akun)
UPDATE public.profiles p
SET foto_url = s.foto_url
FROM public.siswa s
WHERE p.nis = s.nis 
  AND (p.foto_url IS NULL OR p.foto_url = '') 
  AND (s.foto_url IS NOT NULL AND s.foto_url <> '');

-- Dari profiles ke siswa (Murid yang fotonya ada di Pengaturan Akun tapi kosong di Kelola Murid)
UPDATE public.siswa s
SET foto_url = p.foto_url
FROM public.profiles p
WHERE s.nis = p.nis 
  AND (s.foto_url IS NULL OR s.foto_url = '') 
  AND (p.foto_url IS NOT NULL AND p.foto_url <> '');


-- 2. Perbarui Trigger handle_new_user() agar ke depannya
-- saat sinkronisasi akun atau pendaftaran baru otomatis mengambil foto dari tabel siswa.
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
