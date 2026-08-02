-- ============================================================
-- DATA CLEANUP v2 — hapus duplikat siswa & akun dummy
-- Aturan keeper duplikat (nama+kelas sama), berurutan:
--   1. yang SUDAH punya riwayat poin lebih diprioritaskan
--   2. kalau sama-sama ada -> yang jumlah riwayatnya lebih banyak
--   3. kalau sama-sama banyak  -> yang total_poin-nya lebih besar
--   4. kalau masih sama        -> NIS terkecil (aman hapus manapun)
-- Backup dibuat dulu (backup_siswa_terhapus & backup_riwayat_terhapus).
-- Dijalankan di Supabase SQL Editor. JANGAN digabung ke DATABASE_SETUP.sql
-- ============================================================

-- ========== 0) TABEL BACKUP (idempotent) ==========
CREATE TABLE IF NOT EXISTS public.backup_siswa_terhapus AS SELECT * FROM public.siswa WHERE FALSE;
CREATE TABLE IF NOT EXISTS public.backup_riwayat_terhapus AS SELECT * FROM public.riwayat_poin WHERE FALSE;

-- ========== 1) TENTUKAN KEEPER per grup duplikat (nama + kelas) ==========
CREATE TEMP TABLE _keeper AS
SELECT DISTINCT ON (s.nama, s.kelas) s.id
FROM public.siswa s
LEFT JOIN (
  SELECT siswa_id, COUNT(*) AS cnt
  FROM public.riwayat_poin
  GROUP BY siswa_id
) r ON r.siswa_id = s.id
WHERE s.nama NOT ILIKE '%dummy%'
  AND (s.nama, s.kelas) IN (
    SELECT nama, kelas FROM public.siswa
    WHERE nama NOT ILIKE '%dummy%'
    GROUP BY nama, kelas HAVING COUNT(*) > 1
  )
ORDER BY s.nama, s.kelas,
  (r.cnt IS NULL) ASC,
  r.cnt DESC NULLS LAST,
  s.total_poin DESC,
  s.nis ASC;

-- ========== 2) ID YANG AKAN DIHAPUS (duplikat non-keeper + semua dummy) ==========
CREATE TEMP TABLE _hapus AS
SELECT s.id, s.nis
FROM public.siswa s
WHERE s.nama NOT ILIKE '%dummy%'
  AND (s.nama, s.kelas) IN (
    SELECT nama, kelas FROM public.siswa
    WHERE nama NOT ILIKE '%dummy%'
    GROUP BY nama, kelas HAVING COUNT(*) > 1
  )
  AND s.id NOT IN (SELECT id FROM _keeper)
UNION ALL
SELECT id, nis FROM public.siswa WHERE nama ILIKE '%dummy%';

-- ========== 3) BACKUP DATA SEBELUM DIHAPUS ==========
INSERT INTO public.backup_siswa_terhapus
SELECT * FROM public.siswa
WHERE id IN (SELECT id FROM _hapus)
  AND id NOT IN (SELECT id FROM public.backup_siswa_terhapus);

INSERT INTO public.backup_riwayat_terhapus
SELECT * FROM public.riwayat_poin
WHERE siswa_id IN (SELECT id FROM _hapus)
  AND id NOT IN (SELECT id FROM public.backup_riwayat_terhapus);

-- ========== 4) HAPUS AKUN AUTH (profiles ikut terhapus via CASCADE) ==========
DELETE FROM auth.users
WHERE email IN (SELECT nis || '@sman19.sch.id' FROM _hapus);

-- ========== 5) HAPUS BARIS SISWA (riwayat & kehadiran ikut via CASCADE) ==========
DELETE FROM public.siswa WHERE id IN (SELECT id FROM _hapus);

-- ========== VERIFIKASI ==========
SELECT 'jumlah siswa dihapus' AS label, COUNT(*) FROM _hapus;
SELECT 'backup siswa tersimpan' AS label, COUNT(*) FROM public.backup_siswa_terhapus;
SELECT 'backup riwayat tersimpan' AS label, COUNT(*) FROM public.backup_riwayat_terhapus;
SELECT 'sisa dummy' AS label, COUNT(*) FROM public.siswa WHERE nama ILIKE '%dummy%';
SELECT 'sisa duplikat nama+kelas' AS label, COUNT(*) FROM (
  SELECT nama, kelas FROM public.siswa GROUP BY nama, kelas HAVING COUNT(*) > 1
) x;
SELECT 'total siswa tersisa' AS label, COUNT(*) FROM public.siswa;
