-- Update username Rani Rahayu Ningsri, S.Pd (guru) menjadi NIP baru
-- Jalankan di Supabase SQL Editor

-- 1. Update email di auth.users (untuk login)
UPDATE auth.users
SET email = '198601032025212006@sman19.sch.id',
    raw_user_meta_data = raw_user_meta_data || '"nip":"198601032025212006"'::jsonb
WHERE email IN (
  SELECT email FROM public.profiles WHERE nama ILIKE '%Rani Rahayu Ningsri%' AND role = 'guru'
);

-- 2. Update email di profiles
UPDATE public.profiles
SET email = '198601032025212006@sman19.sch.id'
WHERE nama ILIKE '%Rani Rahayu Ningsri%' AND role = 'guru';
